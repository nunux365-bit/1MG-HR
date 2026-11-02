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

logger = logging.getLogger("backend.classifier_service")

# Base directory for saved machine learning artifacts
MODELS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "classification", "models"))
os.makedirs(MODELS_DIR, exist_ok=True)

# In-memory hot-reload model cache: { category_code: { "vectorizer": ..., "model": ..., "metadata": ... } }
MODEL_CACHE: Dict[str, Dict[str, Any]] = {}

def normalize_text(text: str) -> str:
    """Normalizes text by lowercasing, stripping extra whitespace and standardizing punctuation."""
    if not text:
        return ""
    t = text.lower()
    t = re.sub(r"[^\w\s\-\/]", " ", t)
    return " ".join(t.split())

def score_text_against_keywords(
    subject: str,
    body: str,
    strong_keywords: List[str],
    weak_keywords: List[str]
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
    matched_strong = []
    matched_weak = []
    
    # 1. Match Strong Multi-Word Phrases
    for phrase in strong_keywords:
        p_clean = normalize_text(phrase)
        if not p_clean:
            continue
        p_pattern = f" {p_clean} "
        found_in_subj = p_pattern in clean_subj
        found_in_body = p_pattern in clean_body
        
        if found_in_subj:
            score += 3.2
            matched_strong.append(f"{phrase} (Subject +3.2)")
        elif found_in_body:
            score += 2.2
            matched_strong.append(f"{phrase} (Body +2.2)")
            
    # 2. Match Weak Single Keywords
    for kw in weak_keywords:
        kw_clean = normalize_text(kw)
        if not kw_clean:
            continue
        kw_pattern = f" {kw_clean} "
        found_in_subj = kw_pattern in clean_subj
        found_in_body = kw_pattern in clean_body
        
        if found_in_subj:
            score += 1.5
            matched_weak.append(f"{kw} (Subject +1.5)")
        elif found_in_body:
            score += 0.8
            matched_weak.append(f"{kw} (Body +0.8)")
            
    return round(score, 2), matched_strong, matched_weak

def route_stage1_department(
    subject: str,
    body: str,
    departments: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Evaluates query against all configured departments.
    Returns the winning department and score if Score >= 1.5.
    """
    if departments is None:
        departments = execute_query(
            """
            SELECT id, dept_code, team_name, category_code, dept_gmail, sla_hours,
                   default_priority, strong_keywords, weak_keywords, intents, color_accent
            FROM hr_departments
            ORDER BY id ASC;
            """,
            fetch_all=True
        ) or []
        
    candidates = []
    for dept in departments:
        strong_kw = dept.get("strong_keywords") or []
        weak_kw = dept.get("weak_keywords") or []
        
        if isinstance(strong_kw, str):
            try: strong_kw = json.loads(strong_kw)
            except Exception: strong_kw = []
        if isinstance(weak_kw, str):
            try: weak_kw = json.loads(weak_kw)
            except Exception: weak_kw = []
            
        score, strong_matches, weak_matches = score_text_against_keywords(
            subject=subject,
            body=body,
            strong_keywords=strong_kw,
            weak_keywords=weak_kw
        )
        
        if score >= 1.5:
            candidates.append({
                "department": dept,
                "score": score,
                "matched_strong": strong_matches,
                "matched_weak": weak_matches
            })
            
    if not candidates:
        return {
            "matched": False,
            "department": None,
            "score": 0.0,
            "matched_strong": [],
            "matched_weak": [],
            "message": "No department met the minimum routing threshold (Score >= 1.5)."
        }
        
    # Pick candidate with highest score
    candidates.sort(key=lambda c: c["score"], reverse=True)
    winner = candidates[0]
    dept = winner["department"]
    
    return {
        "matched": True,
        "department_id": dept["id"],
        "dept_code": dept["dept_code"],
        "team_name": dept["team_name"],
        "category_code": dept.get("category_code") or dept["dept_code"].replace("DEPT-", ""),
        "dept_gmail": dept.get("dept_gmail"),
        "default_priority": dept.get("default_priority", "MEDIUM"),
        "sla_hours": dept.get("sla_hours", 24),
        "score": winner["score"],
        "matched_strong": winner["matched_strong"],
        "matched_weak": winner["matched_weak"],
        "all_candidates": [
            {"dept_code": c["department"]["dept_code"], "score": c["score"]}
            for c in candidates
        ]
    }

# =========================================================================
# STAGE 2: INTENT CLASSIFIER (scikit-learn LinearSVC + TF-IDF)
# =========================================================================

def get_model_paths(category_code: str) -> Tuple[str, str, str]:
    """Returns filesystem paths for vectorizer, model, and metadata."""
    dept_dir = os.path.join(MODELS_DIR, category_code.lower())
    os.makedirs(dept_dir, exist_ok=True)
    return (
        os.path.join(dept_dir, f"{category_code.lower()}_tfidf_vectorizer.pkl"),
        os.path.join(dept_dir, f"{category_code.lower()}_linear_svm.pkl"),
        os.path.join(dept_dir, "metadata.json")
    )

def load_department_model(category_code: str) -> Optional[Dict[str, Any]]:
    """Loads model from memory cache or reads from disk."""
    cat = category_code.upper()
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
                "metadata": metadata
            }
            logger.info(f"Loaded ML model for category '{cat}' into cache.")
            return MODEL_CACHE[cat]
        except Exception as e:
            logger.error(f"Failed to load ML model for category '{cat}': {e}")
            return None
    return None

def train_department_model(category_code: str, dataset: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Trains a LinearSVC model with TfidfVectorizer on the provided labeled dataset.
    Hot-reloads the weights into memory with zero server restarts.
    """
    if not dataset or len(dataset) < 4:
        raise ValueError("Dataset must contain at least 4 labeled samples.")
        
    texts = []
    labels = []
    
    for item in dataset:
        # Support various dataset schema keys
        text = item.get("text") or item.get("body") or item.get("sample") or ""
        subj = item.get("subject") or ""
        combined = f"{subj} {text}".strip()
        intent = item.get("intent") or item.get("intent_code") or item.get("label") or ""
        
        if combined and intent:
            texts.append(normalize_text(combined))
            labels.append(intent.strip().upper())
            
    unique_labels = list(set(labels))
    if len(unique_labels) < 2:
        raise ValueError(f"Dataset must have at least 2 distinct intent classes. Found: {unique_labels}")
        
    cat = category_code.upper()
    
    # 1. Feature Extraction: Sublinear TF-IDF with unigrams + bigrams
    vectorizer = TfidfVectorizer(
        ngram_range=(1, 2),
        sublinear_tf=True,
        min_df=1
    )
    X = vectorizer.fit_transform(texts)
    y = labels
    
    # 2. Classifier: LinearSVC with balanced class weights
    model = LinearSVC(C=1.0, class_weight="balanced", random_state=42, max_iter=2000)
    
    # If dataset has enough samples, compute test accuracy
    if len(texts) >= 16 and all(labels.count(lbl) >= 2 for lbl in unique_labels):
        try:
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2, random_state=42, stratify=y
            )
            model.fit(X_train, y_train)
            accuracy = float(model.score(X_test, y_test)) * 100.0
            # Retrain on full dataset for maximum production coverage
            model.fit(X, y)
        except Exception:
            model.fit(X, y)
            accuracy = float(model.score(X, y)) * 100.0
    else:
        model.fit(X, y)
        accuracy = float(model.score(X, y)) * 100.0
        
    accuracy = round(accuracy, 2)
    
    # 3. Save weights and metadata to disk
    vec_path, svm_path, meta_path = get_model_paths(cat)
    joblib.dump(vectorizer, vec_path)
    joblib.dump(model, svm_path)
    
    metadata = {
        "category_code": cat,
        "sample_count": len(texts),
        "intents": unique_labels,
        "intent_count": len(unique_labels),
        "accuracy": accuracy,
        "trained_at": "NOW()"
    }
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
        
    # 4. Hot-reload into in-memory cache
    MODEL_CACHE[cat] = {
        "vectorizer": vectorizer,
        "model": model,
        "metadata": metadata
    }
    
    # 5. Update database record
    execute_query(
        """
        UPDATE hr_departments
        SET ai_model_status = 'TRAINED',
            model_accuracy = %s,
            trained_at = NOW()
        WHERE UPPER(category_code) = %s OR UPPER(dept_code) = %s;
        """,
        (accuracy, cat, f"DEPT-{cat}"),
        commit=True
    )
    
    return {
        "success": True,
        "category_code": cat,
        "sample_count": len(texts),
        "intent_count": len(unique_labels),
        "accuracy": accuracy,
        "intents": unique_labels,
        "message": f"Successfully trained & hot-reloaded {cat} intent model ({accuracy}% accuracy across {len(texts)} samples)."
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
    
    # Compute decision margin / confidence approximation
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
        
    # Convert margin to 0-100% confidence scale
    confidence = min(99.4, max(65.0, round(70.0 + (margin * 12.0), 1)))
    
    return {
        "intent_code": str(predicted_intent),
        "confidence": float(confidence),
        "margin": round(float(margin), 2)
    }

# =========================================================================
# STAGE 3: FULL PIPELINE EVALUATION & LIVE SANDBOX
# =========================================================================

def run_live_classification_sandbox(
    subject: str,
    body: str,
    forced_dept_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Runs the complete 3-stage classification pipeline for live testing.
    """
    departments = execute_query(
        """
        SELECT id, dept_code, team_name, category_code, dept_gmail, sla_hours,
               default_priority, strong_keywords, weak_keywords, intents, color_accent,
               ai_model_status, model_accuracy
        FROM hr_departments
        ORDER BY id ASC;
        """,
        fetch_all=True
    ) or []
    
    target_dept = None
    stage1_result = None
    
    if forced_dept_id:
        target_dept = next((d for d in departments if d["id"] == forced_dept_id), None)
        if target_dept:
            strong_kw = target_dept.get("strong_keywords") or []
            weak_kw = target_dept.get("weak_keywords") or []
            score, s_matches, w_matches = score_text_against_keywords(
                subject, body, strong_kw, weak_kw
            )
            stage1_result = {
                "matched": True,
                "department_id": target_dept["id"],
                "dept_code": target_dept["dept_code"],
                "team_name": target_dept["team_name"],
                "category_code": target_dept.get("category_code") or target_dept["dept_code"].replace("DEPT-", ""),
                "score": score,
                "matched_strong": s_matches,
                "matched_weak": w_matches
            }
    
    if not stage1_result:
        stage1_result = route_stage1_department(subject, body, departments)
        if stage1_result["matched"]:
            target_dept = next((d for d in departments if d["id"] == stage1_result["department_id"]), None)
            
    if not target_dept or not stage1_result.get("matched"):
        return {
            "success": False,
            "stage1": stage1_result,
            "stage2": None,
            "verdict": "Unrouted: Query did not meet threshold for any active HR desk."
        }
        
    # Stage 2 Intent Prediction
    category_code = target_dept.get("category_code") or target_dept["dept_code"].replace("DEPT-", "")
    full_text = f"{subject} {body}"
    intent_pred = predict_intent(category_code, full_text)
    
    # Map intent details from department config
    intents_list = target_dept.get("intents") or []
    if isinstance(intents_list, str):
        try: intents_list = json.loads(intents_list)
        except Exception: intents_list = []
        
    intent_info = None
    sla_target = target_dept.get("sla_hours", 24)
    
    if intent_pred:
        code = intent_pred["intent_code"]
        match = next((i for i in intents_list if i.get("code") == code), None)
        if match:
            intent_info = {
                "code": code,
                "name": match.get("name", "Standard Inquiry"),
                "sla_hours": match.get("sla_hours", sla_target)
            }
            sla_target = match.get("sla_hours", sla_target)
        else:
            intent_info = {
                "code": code,
                "name": f"Operational Intent {code}",
                "sla_hours": sla_target
            }
    elif intents_list:
        # Default to first intent if model not yet trained
        intent_info = {
            "code": intents_list[0].get("code", "GN01"),
            "name": intents_list[0].get("name", "General Query"),
            "sla_hours": intents_list[0].get("sla_hours", sla_target)
        }
        intent_pred = {
            "intent_code": intent_info["code"],
            "confidence": 75.0,
            "margin": 0.5
        }
        
    return {
        "success": True,
        "department": {
            "id": target_dept["id"],
            "dept_code": target_dept["dept_code"],
            "team_name": target_dept["team_name"],
            "category_code": category_code,
            "dept_gmail": target_dept.get("dept_gmail"),
            "color_accent": target_dept.get("color_accent", "#FF6F61"),
            "ai_model_status": target_dept.get("ai_model_status", "UNTRAINED")
        },
        "stage1": stage1_result,
        "stage2": {
            "predicted_intent": intent_info,
            "confidence": intent_pred.get("confidence", 85.0) if intent_pred else 80.0,
            "margin": intent_pred.get("margin", 1.0) if intent_pred else 1.0,
            "is_model_trained": target_dept.get("ai_model_status") == "TRAINED"
        },
        "stage3_dispatch": {
            "assigned_team": target_dept["team_name"],
            "routing_email": target_dept.get("dept_gmail"),
            "priority": target_dept.get("default_priority", "MEDIUM"),
            "sla_hours": sla_target,
            "dispatch_ready": True
        }
    }

# =========================================================================
# CHATGPT PROMPT GENERATORS
# =========================================================================

def build_stage1_keyword_prompt(
    team_name: str,
    dept_code: str,
    category_code: str,
    description: str
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
    intents: List[Dict[str, Any]]
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
