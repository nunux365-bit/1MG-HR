import html
import os
import re
import json
import logging
from typing import List, Dict, Any, Optional, Tuple
import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import LinearSVC
from sklearn.model_selection import train_test_split
from backend.app.database import execute_query
from backend.app.classification.starter_datasets import (
    CATEGORY_ALIASES,
    CANONICAL_DEPARTMENT_CONFIGS,
    STARTER_DATASETS,
)

logger = logging.getLogger("backend.classifier_service")

# Base directory for saved machine learning artifacts
MODELS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "classification", "models"))
os.makedirs(MODELS_DIR, exist_ok=True)

# In-memory hot-reload model cache: { category_code: { "vectorizer": ..., "model": ..., "metadata": ... } }
MODEL_CACHE: Dict[str, Dict[str, Any]] = {}

HINGLISH_MARKERS = (
    "nahi", "karni", "karo", "kardo", "gaya", "gayi", "mera", "meri", "aayi",
    "chahiye", "chutti", "batao", "karwa", "karwana", "abhi", "zyada", "paisa",
    "kripya", "dekho", "bhul", "ghante", "galat"
)

URGENCY_PATTERNS = re.compile(
    r"\b(urgent|urgently|emergency|hospital|admission|admitted|cashless|"
    r"salary hold|salary stuck|posh|harassment|critical|asap|immediate|"
    r"immediately|scanner failure|breach|timeout|blocked)\b",
    re.IGNORECASE,
)


def normalize_text(text: str) -> str:
    """Normalizes text by decoding HTML entities, lowercasing, and splitting punctuation/underscores."""
    if not text:
        return ""
    t = html.unescape(text).lower()
    t = re.sub(r"[^a-z0-9\s\-\/]", " ", t)
    return " ".join(t.split())


def _parse_json_list(raw: Any) -> List[Any]:
    """Parses JSONB string/list fields and removes accidental inner double-quote wrappers."""
    items = raw
    if isinstance(raw, str):
        try:
            items = json.loads(raw)
        except Exception:
            items = []
    if not isinstance(items, list):
        return []
    cleaned: List[Any] = []
    for item in items:
        if isinstance(item, str):
            val = item.strip().strip('"').strip("'").strip()
            if val:
                cleaned.append(val)
        else:
            cleaned.append(item)
    return cleaned


def resolve_category_code(dept: Optional[Dict[str, Any]], explicit_code: Optional[str] = None) -> str:
    """Resolves canonical department category code from row or alias."""
    raw = explicit_code or (dept.get("category_code") if dept else "") or (
        (dept.get("dept_code") or "").replace("DEPT-", "") if dept else ""
    )
    code = str(raw or "").strip().upper()
    return CATEGORY_ALIASES.get(code, code or "PEOPLEDESK")


def detect_language(text: str) -> str:
    """Identifies Corporate English vs Hindi / Romanized Hinglish."""
    lower = (text or "").lower()
    if any(re.search(rf"\b{w}\b", lower) for w in HINGLISH_MARKERS):
        return "Hindi / Hinglish"
    return "Corporate English"


def detect_urgency(text: str) -> bool:
    """Detects high-urgency / critical workplace triggers."""
    return bool(URGENCY_PATTERNS.search(text or ""))


def _fetch_departments() -> List[Dict[str, Any]]:
    """Loads all departments from DB with AI keywords & intents."""
    return (
        execute_query(
            """
            SELECT id, dept_code, team_name, category_code, dept_gmail, sla_hours,
                   default_priority, strong_keywords, weak_keywords, intents, color_accent,
                   ai_model_status, model_accuracy
            FROM hr_departments
            ORDER BY id ASC;
            """,
            fetch_all=True,
        )
        or []
    )


def score_text_against_keywords(
    subject: str,
    body: str,
    strong_keywords: List[str],
    weak_keywords: List[str],
) -> Tuple[float, List[str], List[str]]:
    """
    Weighted Keyword Scoring Algorithm (Stage 1):
    - Strong multi-word phrases: +3.2 in Subject, +2.2 in Body
    - Weak single-word keywords: +1.5 in Subject, +0.8 in Body
    - Routing Threshold: Score >= 1.5
    """
    clean_subj = f" {normalize_text(subject)} "
    clean_body = f" {normalize_text(body)} "

    score = 0.0
    matched_strong: List[str] = []
    matched_weak: List[str] = []

    for phrase in _parse_json_list(strong_keywords):
        p_clean = normalize_text(str(phrase))
        if not p_clean:
            continue
        p_pattern = f" {p_clean} "
        if p_pattern in clean_subj:
            score += 3.2
            matched_strong.append(f"{phrase} (Subject +3.2)")
        elif p_pattern in clean_body:
            score += 2.2
            matched_strong.append(f"{phrase} (Body +2.2)")

    for kw in _parse_json_list(weak_keywords):
        kw_clean = normalize_text(str(kw))
        if not kw_clean:
            continue
        kw_pattern = f" {kw_clean} "
        if kw_pattern in clean_subj:
            score += 1.5
            matched_weak.append(f"{kw} (Subject +1.5)")
        elif kw_pattern in clean_body:
            score += 0.8
            matched_weak.append(f"{kw} (Body +0.8)")

    return round(score, 2), matched_strong, matched_weak


def route_stage1_department(
    subject: str,
    body: str,
    departments: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Evaluates query against all configured departments.
    Returns the winning department and score if Score >= 1.5.
    Specialized desks take precedence over catch-all People Desk on ties or modest general overlap.
    """
    if departments is None:
        departments = _fetch_departments()

    candidates = []
    for dept in departments:
        strong_kw = _parse_json_list(dept.get("strong_keywords"))
        weak_kw = _parse_json_list(dept.get("weak_keywords"))

        score, strong_matches, weak_matches = score_text_against_keywords(
            subject=subject,
            body=body,
            strong_keywords=strong_kw,
            weak_keywords=weak_kw,
        )

        if score >= 1.5:
            cat_code = resolve_category_code(dept)
            is_catchall = dept.get("dept_code") == "DEPT-PEOPLEDESK" or cat_code == "PEOPLEDESK"
            candidates.append({
                "department": dept,
                "category_code": cat_code,
                "is_catchall": is_catchall,
                "score": score,
                "matched_strong": strong_matches,
                "matched_weak": weak_matches,
            })

    if not candidates:
        return {
            "matched": False,
            "department": None,
            "score": 0.0,
            "matched_strong": [],
            "matched_weak": [],
            "message": "No department met the minimum routing threshold (Score >= 1.5).",
        }

    # Prefer specialized departments over catch-all People Desk unless People Desk dominates by >= 2.5
    specialized = [c for c in candidates if not c["is_catchall"]]
    catchalls = [c for c in candidates if c["is_catchall"]]

    candidates.sort(key=lambda c: (not c["is_catchall"], c["score"]), reverse=True)
    if specialized and catchalls:
        best_spec = max(specialized, key=lambda c: c["score"])
        best_catchall = max(catchalls, key=lambda c: c["score"])
        winner = best_catchall if best_catchall["score"] >= best_spec["score"] + 2.5 else best_spec
    else:
        winner = candidates[0]

    dept = winner["department"]
    return {
        "matched": True,
        "department_id": dept["id"],
        "dept_code": dept["dept_code"],
        "team_name": dept["team_name"],
        "category_code": winner["category_code"],
        "dept_gmail": dept.get("dept_gmail"),
        "default_priority": dept.get("default_priority", "MEDIUM"),
        "sla_hours": dept.get("sla_hours", 24),
        "score": winner["score"],
        "matched_strong": winner["matched_strong"],
        "matched_weak": winner["matched_weak"],
        "all_candidates": [
            {"dept_code": c["department"]["dept_code"], "score": c["score"]}
            for c in sorted(candidates, key=lambda c: c["score"], reverse=True)
        ],
    }


# =========================================================================
# STAGE 2: INTENT CLASSIFIER & CROSS-DEPARTMENT ML ROUTER (LinearSVC + TF-IDF)
# =========================================================================

def get_model_paths(category_code: str) -> Tuple[str, str, str]:
    """Returns filesystem paths for vectorizer, model, and metadata."""
    clean_name = re.sub(r"[^a-z0-9_]", "", category_code.lower()) or "general"
    dept_dir = os.path.join(MODELS_DIR, clean_name)
    os.makedirs(dept_dir, exist_ok=True)
    return (
        os.path.join(dept_dir, f"{clean_name}_tfidf_vectorizer.pkl"),
        os.path.join(dept_dir, f"{clean_name}_linear_svm.pkl"),
        os.path.join(dept_dir, "metadata.json"),
    )


def load_department_model(category_code: str) -> Optional[Dict[str, Any]]:
    """Loads model from memory cache or reads from disk."""
    cat = CATEGORY_ALIASES.get(category_code.upper(), category_code.upper())
    if cat in MODEL_CACHE:
        return MODEL_CACHE[cat]

    vec_path, svm_path, meta_path = get_model_paths(cat)
    if os.path.exists(vec_path) and os.path.exists(svm_path):
        try:
            vectorizer = joblib.load(vec_path)
            model = joblib.load(svm_path)
            metadata = {}
            if os.path.exists(meta_path):
                with open(meta_path, "r", encoding="utf-8") as f:
                    metadata = json.load(f)
            MODEL_CACHE[cat] = {
                "vectorizer": vectorizer,
                "model": model,
                "metadata": metadata,
            }
            logger.info(f"Loaded ML model for category '{cat}' into cache.")
            return MODEL_CACHE[cat]
        except Exception as e:
            logger.error(f"Failed to load ML model for category '{cat}': {e}")
            return None
    return None


def _build_router_training_samples(active_categories: Optional[List[str]] = None) -> Tuple[List[str], List[str]]:
    """Builds cross-department training examples from canonical keywords & starter datasets."""
    cats = set(active_categories or ["PAYROLL", "BENEFITS", "LEAVES", "RELATIONS", "PEOPLEDESK"])
    texts: List[str] = []
    labels: List[str] = []

    for cat in sorted(cats):
        for item in STARTER_DATASETS.get(cat, []):
            combined = f"{item.get('subject', '')} {item.get('body', item.get('text', ''))}".strip()
            norm = normalize_text(combined)
            if norm:
                texts.append(norm)
                labels.append(cat)

    for cfg in CANONICAL_DEPARTMENT_CONFIGS:
        cat = cfg["category_code"]
        if cat not in cats:
            continue
        phrases = cfg.get("strong_keywords", []) + cfg.get("weak_keywords", [])
        if phrases:
            for p in phrases:
                norm = normalize_text(p)
                if norm:
                    texts.append(norm)
                    labels.append(cat)

    return texts, labels


def _load_or_build_department_router(active_categories: Optional[List[str]] = None) -> Optional[Dict[str, Any]]:
    """Loads or builds the Stage 2 cross-department TF-IDF + LinearSVC router."""
    router_key = "__DEPT_ROUTER__"
    target_cats = tuple(sorted(set(active_categories or ["PAYROLL", "BENEFITS", "LEAVES", "RELATIONS", "PEOPLEDESK"])))
    cached = MODEL_CACHE.get(router_key)
    if cached and tuple(cached.get("categories", ())) == target_cats:
        return cached

    texts, labels = _build_router_training_samples(list(target_cats))
    if len(set(labels)) < 2:
        return None

    try:
        vectorizer = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=1)
        X = vectorizer.fit_transform(texts)
        model = LinearSVC(C=1.0, class_weight="balanced", random_state=42, max_iter=3000)
        model.fit(X, labels)
        bundle = {
            "vectorizer": vectorizer,
            "model": model,
            "categories": target_cats,
        }
        MODEL_CACHE[router_key] = bundle
        return bundle
    except Exception as err:
        logger.warning(f"Failed to build cross-department ML router: {err}")
        return None


def predict_department_ml(
    subject: str,
    body: str,
    active_categories: Optional[List[str]] = None,
) -> Optional[Dict[str, Any]]:
    """Uses cross-department TF-IDF + LinearSVC to predict the department category and confidence."""
    bundle = _load_or_build_department_router(active_categories)
    if not bundle:
        return None

    clean = normalize_text(f"{subject} {body}")
    if not clean:
        return None

    X = bundle["vectorizer"].transform([clean])
    if X.nnz == 0:
        # Zero vocabulary overlap with HR training corpus
        return {
            "category_code": "PEOPLEDESK",
            "confidence": 66.0,
            "margin": 0.0,
            "low_signal": True,
        }

    pred_cat = str(bundle["model"].predict(X)[0])
    try:
        scores = bundle["model"].decision_function(X)
        if scores.ndim == 1:
            margin = float(abs(scores[0]))
        else:
            row_sorted = sorted(scores[0], reverse=True)
            margin = float(row_sorted[0] - row_sorted[1]) if len(row_sorted) > 1 else float(row_sorted[0])
    except Exception:
        margin = 0.25

    confidence = min(98.5, max(62.0, round(68.0 + (margin * 18.0), 1)))
    low_signal = margin < 0.12
    return {
        "category_code": "PEOPLEDESK" if low_signal else pred_cat,
        "confidence": confidence if not low_signal else min(confidence, 70.0),
        "margin": round(margin, 3),
        "low_signal": low_signal,
    }


def train_department_model(category_code: str, dataset: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Trains a LinearSVC model with TfidfVectorizer on the provided labeled dataset.
    Hot-reloads the weights into memory with zero server restarts.
    """
    if not dataset or len(dataset) < 4:
        raise ValueError("Dataset must contain at least 4 labeled samples.")

    texts: List[str] = []
    labels: List[str] = []

    for item in dataset:
        text = item.get("text") or item.get("body") or item.get("sample") or ""
        subj = item.get("subject") or ""
        combined = f"{subj} {text}".strip()
        intent = item.get("intent") or item.get("intent_code") or item.get("label") or ""

        if combined and intent:
            texts.append(normalize_text(combined))
            labels.append(intent.strip().upper())

    unique_labels = sorted(set(labels))
    if len(unique_labels) < 2:
        raise ValueError(f"Dataset must have at least 2 distinct intent classes. Found: {unique_labels}")

    cat = category_code.upper()

    vectorizer = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=1)
    X = vectorizer.fit_transform(texts)
    y = labels

    model = LinearSVC(C=1.0, class_weight="balanced", random_state=42, max_iter=2000)

    if len(texts) >= 16 and all(labels.count(lbl) >= 2 for lbl in unique_labels):
        try:
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2, random_state=42, stratify=y
            )
            model.fit(X_train, y_train)
            accuracy = float(model.score(X_test, y_test)) * 100.0
            model.fit(X, y)
        except Exception:
            model.fit(X, y)
            accuracy = float(model.score(X, y)) * 100.0
    else:
        model.fit(X, y)
        accuracy = float(model.score(X, y)) * 100.0

    accuracy = round(accuracy, 2)

    vec_path, svm_path, meta_path = get_model_paths(cat)
    joblib.dump(vectorizer, vec_path)
    joblib.dump(model, svm_path)

    metadata = {
        "category_code": cat,
        "sample_count": len(texts),
        "intents": unique_labels,
        "intent_count": len(unique_labels),
        "accuracy": accuracy,
        "trained_at": "NOW()",
    }
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    MODEL_CACHE[cat] = {
        "vectorizer": vectorizer,
        "model": model,
        "metadata": metadata,
    }
    MODEL_CACHE.pop("__DEPT_ROUTER__", None)

    execute_query(
        """
        UPDATE hr_departments
        SET ai_model_status = 'TRAINED',
            model_accuracy = %s,
            trained_at = NOW(),
            updated_at = NOW()
        WHERE UPPER(COALESCE(category_code, '')) = %s OR UPPER(dept_code) = %s;
        """,
        (accuracy, cat, f"DEPT-{cat}"),
        commit=True,
    )

    return {
        "success": True,
        "category_code": cat,
        "sample_count": len(texts),
        "intent_count": len(unique_labels),
        "accuracy": accuracy,
        "intents": unique_labels,
        "message": f"Successfully trained & hot-reloaded {cat} intent model ({accuracy}% accuracy across {len(texts)} samples).",
    }


def predict_intent(category_code: str, text: str) -> Optional[Dict[str, Any]]:
    """Predicts the intent code and margin score for a query."""
    bundle = load_department_model(category_code)
    if not bundle:
        return None

    vectorizer = bundle["vectorizer"]
    model = bundle["model"]

    clean = normalize_text(text)
    if not clean:
        return None

    X = vectorizer.transform([clean])
    predicted_intent = str(model.predict(X)[0])

    try:
        decision_scores = model.decision_function(X)
        if decision_scores.ndim == 1:
            margin = float(abs(decision_scores[0]))
        else:
            scores = decision_scores[0]
            scores_sorted = sorted(scores, reverse=True)
            margin = float(scores_sorted[0] - scores_sorted[1]) if len(scores_sorted) > 1 else float(scores_sorted[0])
    except Exception:
        margin = 1.0

    confidence = min(99.4, max(65.0, round(70.0 + (margin * 15.0), 1)))
    if X.nnz == 0:
        confidence = 65.0
        margin = 0.0

    return {
        "intent_code": str(predicted_intent),
        "confidence": float(confidence),
        "margin": round(float(margin), 2),
    }


def _find_department_by_category(departments: List[Dict[str, Any]], cat_code: str) -> Optional[Dict[str, Any]]:
    """Finds matching department row for canonical category code, falling back safely."""
    norm_cat = CATEGORY_ALIASES.get(cat_code.upper(), cat_code.upper())
    for d in departments:
        if resolve_category_code(d) == norm_cat:
            return d
        if (d.get("dept_code") or "").upper() == f"DEPT-{norm_cat}":
            return d
    for d in departments:
        if (d.get("dept_code") or "").upper() == "DEPT-PEOPLEDESK" or resolve_category_code(d) == "PEOPLEDESK":
            return d
    return departments[0] if departments else None


def classify_inbound_email_ai(
    subject: str,
    body: str,
    explicit_category: Optional[str] = None,
    forced_dept_id: Optional[int] = None,
    departments: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Unified 3-Stage AI Triage Pipeline for live email ingestion & sandbox:
    1. Stage 1 weighted bilingual keyword scoring across all live hr_departments.
    2. Stage 2 cross-department LinearSVC + TF-IDF ML fallback when keywords miss/tie.
    3. Per-department Stage 2 LinearSVC intent & SLA resolution + confidence normalization.
    """
    if departments is None:
        departments = _fetch_departments()

    full_text = f"{subject or ''}\n{body or ''}".strip()
    is_urgent = detect_urgency(full_text)
    language = detect_language(full_text)

    target_dept: Optional[Dict[str, Any]] = None
    stage1_result: Dict[str, Any] = {
        "matched": False,
        "score": 0.0,
        "matched_strong": [],
        "matched_weak": [],
    }
    routing_source = "PEOPLEDESK_FALLBACK"
    router_pred: Optional[Dict[str, Any]] = None

    if forced_dept_id:
        target_dept = next((d for d in departments if d["id"] == forced_dept_id), None)
        if target_dept:
            routing_source = "MANUAL_DEPT"
            score, s_matches, w_matches = score_text_against_keywords(
                subject, body, target_dept.get("strong_keywords") or [], target_dept.get("weak_keywords") or []
            )
            stage1_result = {
                "matched": True,
                "department_id": target_dept["id"],
                "dept_code": target_dept["dept_code"],
                "team_name": target_dept["team_name"],
                "category_code": resolve_category_code(target_dept),
                "score": score,
                "matched_strong": s_matches,
                "matched_weak": w_matches,
            }

    if not target_dept and explicit_category and explicit_category.upper() not in ("", "UNKNOWN", "AUTO"):
        norm_explicit = CATEGORY_ALIASES.get(explicit_category.upper(), explicit_category.upper())
        target_dept = _find_department_by_category(departments, norm_explicit)
        if target_dept:
            routing_source = "EXPLICIT_CATEGORY"

    if not target_dept:
        stage1_result = route_stage1_department(subject, body, departments)
        if stage1_result.get("matched"):
            target_dept = next((d for d in departments if d["id"] == stage1_result["department_id"]), None)
            if target_dept:
                routing_source = "STAGE1_KEYWORDS"

    if not target_dept:
        active_cats = [resolve_category_code(d) for d in departments]
        router_pred = predict_department_ml(subject, body, active_categories=active_cats)
        if router_pred:
            target_dept = _find_department_by_category(departments, router_pred["category_code"])
            routing_source = (
                "PEOPLEDESK_FALLBACK" if router_pred.get("low_signal") else "STAGE2_ML_ROUTER"
            )

    if not target_dept:
        target_dept = _find_department_by_category(departments, "PEOPLEDESK")

    if not target_dept:
        return {
            "success": False,
            "department_id": None,
            "dept_code": "DEPT-PEOPLEDESK",
            "team_name": "People Desk",
            "category_code": "PEOPLEDESK",
            "intent_code": "PD06",
            "intent_label": "General Inquiry",
            "sla_hours": 24,
            "target_sla": "4h Urgent SLA" if is_urgent else "24h Target SLA",
            "default_priority": "HIGH" if is_urgent else "MEDIUM",
            "confidence": 65.0,
            "confidence_ratio": 0.65,
            "margin": 0.0,
            "is_urgent": is_urgent,
            "language": language,
            "requires_review": 1,
            "routing_source": "NO_DEPT_CONFIGURED",
            "stage1": stage1_result,
            "stage2": None,
        }

    category_code = resolve_category_code(target_dept)
    dept_sla = int(target_dept.get("sla_hours") or 24)
    intents_list = _parse_json_list(target_dept.get("intents"))
    if not intents_list:
        cfg_match = next((c for c in CANONICAL_DEPARTMENT_CONFIGS if c["category_code"] == category_code), None)
        intents_list = cfg_match.get("intents", []) if cfg_match else []

    intent_pred = predict_intent(category_code, full_text)
    intent_info: Dict[str, Any]
    sla_target = dept_sla

    if intent_pred:
        code = intent_pred["intent_code"]
        match = next((i for i in intents_list if isinstance(i, dict) and i.get("code") == code), None)
        if match:
            sla_target = int(match.get("sla_hours") or dept_sla)
            intent_info = {
                "code": code,
                "name": match.get("name", "Standard Inquiry"),
                "sla_hours": sla_target,
            }
        else:
            intent_info = {
                "code": code,
                "name": f"{target_dept['team_name']} Inquiry ({code})",
                "sla_hours": sla_target,
            }
    elif intents_list and isinstance(intents_list[0], dict):
        first_intent = intents_list[0]
        sla_target = int(first_intent.get("sla_hours") or dept_sla)
        intent_info = {
            "code": first_intent.get("code", "GN01"),
            "name": first_intent.get("name", "General Query"),
            "sla_hours": sla_target,
        }
        intent_pred = {"intent_code": intent_info["code"], "confidence": 75.0, "margin": 0.5}
    else:
        intent_info = {
            "code": f"{category_code[:2]}01",
            "name": f"{target_dept['team_name']} Support Request",
            "sla_hours": sla_target,
        }
        intent_pred = {"intent_code": intent_info["code"], "confidence": 72.0, "margin": 0.3}

    # Combine Stage 1 + Stage 2 certainty cleanly
    raw_conf = float(intent_pred.get("confidence", 80.0))
    if routing_source == "STAGE1_KEYWORDS":
        s1_score = float(stage1_result.get("score") or 0.0)
        boosted = min(99.4, max(raw_conf, 88.0 + min(s1_score, 8.0) * 1.4))
        confidence_pct = round(boosted, 1)
    elif routing_source == "STAGE2_ML_ROUTER" and router_pred:
        confidence_pct = round(min(96.5, (raw_conf * 0.4 + float(router_pred["confidence"]) * 0.6)), 1)
    elif routing_source == "PEOPLEDESK_FALLBACK":
        confidence_pct = round(min(72.0, float(router_pred["confidence"]) if router_pred else 68.0), 1)
    else:
        confidence_pct = round(raw_conf, 1)

    confidence_ratio = round(confidence_pct / 100.0, 4)
    requires_review = 1 if (confidence_ratio < 0.70 or routing_source == "PEOPLEDESK_FALLBACK") else 0

    if is_urgent and sla_target > 4:
        effective_sla_label = "4h Urgent SLA"
    else:
        effective_sla_label = f"{sla_target}h Target SLA"

    default_prio = (target_dept.get("default_priority") or "MEDIUM").upper()
    if is_urgent:
        resolved_priority = "HIGH" if default_prio in ("LOW", "MEDIUM") else default_prio
    else:
        resolved_priority = default_prio

    return {
        "success": True,
        "department": {
            "id": target_dept["id"],
            "dept_code": target_dept["dept_code"],
            "team_name": target_dept["team_name"],
            "category_code": category_code,
            "dept_gmail": target_dept.get("dept_gmail"),
            "color_accent": target_dept.get("color_accent", "#FF6F61"),
            "ai_model_status": target_dept.get("ai_model_status", "UNTRAINED"),
        },
        "department_id": target_dept["id"],
        "dept_code": target_dept["dept_code"],
        "team_name": target_dept["team_name"],
        "category_code": category_code,
        "dept_gmail": target_dept.get("dept_gmail"),
        "default_priority": resolved_priority,
        "sla_hours": sla_target,
        "target_sla": effective_sla_label,
        "intent_code": intent_info["code"],
        "intent_label": intent_info["name"],
        "confidence": confidence_pct,
        "confidence_ratio": confidence_ratio,
        "margin": float(intent_pred.get("margin", 0.5)),
        "is_urgent": is_urgent,
        "language": language,
        "requires_review": requires_review,
        "routing_source": routing_source,
        "stage1": stage1_result,
        "stage2": {
            "predicted_intent": intent_info,
            "confidence": confidence_pct,
            "margin": float(intent_pred.get("margin", 0.5)),
            "is_model_trained": target_dept.get("ai_model_status") == "TRAINED" or load_department_model(category_code) is not None,
        },
        "stage3_dispatch": {
            "assigned_team": target_dept["team_name"],
            "routing_email": target_dept.get("dept_gmail"),
            "priority": resolved_priority,
            "sla_hours": sla_target,
            "dispatch_ready": True,
        },
    }


# =========================================================================
# STAGE 3: FULL PIPELINE EVALUATION & LIVE SANDBOX
# =========================================================================

def run_live_classification_sandbox(
    subject: str,
    body: str,
    forced_dept_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Runs the complete 3-stage classification pipeline for live testing."""
    res = classify_inbound_email_ai(
        subject=subject,
        body=body,
        forced_dept_id=forced_dept_id,
    )
    if not res.get("success"):
        return {
            "success": False,
            "stage1": res.get("stage1"),
            "stage2": None,
            "verdict": "Unrouted: No active HR desk configured.",
        }
    return {
        "success": True,
        "department": res["department"],
        "stage1": res["stage1"],
        "stage2": res["stage2"],
        "stage3_dispatch": res["stage3_dispatch"],
        "routing_source": res["routing_source"],
    }


# =========================================================================
# CHATGPT PROMPT GENERATORS
# =========================================================================

def build_stage1_keyword_prompt(
    team_name: str,
    dept_code: str,
    category_code: str,
    description: str,
) -> str:
    """Generates an optimized ChatGPT prompt to generate Stage 1 strong & weak keywords."""
    return f"""You are an elite NLP Data Architect configuring Stage 1 routing for the Tata 1mg People Desk email triage system.

DEPARTMENT CONTEXT:
- Department Name: {team_name}
- Department Code: {dept_code}
- Category Code: {category_code}
- Scope / Role: {description or 'Enterprise employee support and inquiry management for Tata 1mg'}

TASK:
Generate high-precision routing keywords for this department. 
Our Stage 1 scoring algorithm uses:
- Strong Multi-Word Phrases (+3.2 points in Subject, +2.2 points in Body)
- Weak Single-Word Keywords (+1.5 points in Subject, +0.8 points in Body)
- Target Threshold >= 1.5 to route directly to this desk.

Indian Workplace Requirement:
Tata 1mg employees frequently write in formal English as well as natural Indian workplace Hinglish (e.g., 'punch miss ho gaya', 'salary nahi aayi', 'chutti approve kardo', 'laptop crash ho gaya'). You MUST include both English and Romanized workplace Hinglish.

OUTPUT FORMAT:
Return strictly a valid JSON object with two arrays (no markdown outside the JSON):
{{
  "strong_keywords": [
    "example strong phrase in english",
    "example strong phrase in hinglish"
  ],
  "weak_keywords": [
    "keyword1",
    "keyword2"
  ]
}}

Requirements:
- 20 to 28 Strong Multi-Word Phrases (exact 2-4 word phrases, 65% English / 35% Hinglish)
- 15 to 22 Weak Single-Word Keywords (high-relevance domain vocabulary)
- All lowercase, no special symbols.
"""


def build_stage2_intent_prompt(
    team_name: str,
    dept_code: str,
    category_code: str,
    intents: List[Dict[str, Any]],
) -> str:
    """Generates an optimized ChatGPT prompt to generate a 400-sample Stage 2 training dataset."""
    intents_spec = "\n".join([
        f"- {i.get('code')}: {i.get('name')} (SLA: {i.get('sla_hours', 24)}h)"
        for i in intents
    ])

    return f"""You are an elite Machine Learning Dataset Engineer building a production training dataset for Tata 1mg People Desk's scikit-learn LinearSVC intent classifier.

DEPARTMENT INFORMATION:
- Team: {team_name} ({dept_code})
- Functional Category: {category_code}

OPERATIONAL INTENTS TO TRAIN:
{intents_spec}

REQUIREMENT:
Generate a high-quality JSON dataset of realistic incoming employee emails for these intents.
- Exactly 8 intents (or all listed above).
- Realistic employee queries including Subjects and realistic Email Bodies.
- Linguistic Mix: 65% Corporate English, 35% Indian workplace Romanized Hinglish (e.g., 'sir salary credit nahi hui Form 16 check karo', 'timesheet approve karwa do punch bhul gaya tha').
- High diversity: short 1-line queries, urgent escalations, detailed explanation emails.

OUTPUT FORMAT:
Return strictly a valid JSON array of objects (no markdown outside the JSON, valid JSON syntax):
[
  {{
    "intent": "{intents[0].get('code') if intents else 'INT01'}",
    "subject": "Sample email subject",
    "body": "Sample email body explaining the issue"
  }}
]

Generate at least 40-50 high-quality samples covering each intent evenly.
"""
