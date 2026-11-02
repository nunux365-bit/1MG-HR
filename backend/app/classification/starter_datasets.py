"""
Starter high-precision training datasets for Tata 1mg People Desk intent classification.
Combines formal corporate English and natural Indian workplace Romanized Hinglish.
"""
from typing import Dict, List, Any

STARTER_DATASETS: Dict[str, List[Dict[str, Any]]] = {
    "ATTENDANCE": [
        {"intent": "AT01", "subject": "Punch regularize kar do please", "body": "Sir yesterday my biometric didn't register at entry gate. Please regularize it."},
        {"intent": "AT01", "subject": "Missed swipe regularisation request", "body": "Forgot to swipe out yesterday due to urgent team meeting. Kindly approve regularisation."},
        {"intent": "AT01", "subject": "Biometric device not recognizing fingerprint", "body": "Biometric reader showed failure multiple times this morning, entry missed."},
        {"intent": "AT01", "subject": "Punch miss ho gaya tha morning me", "body": "Entry punch record nahi hua device pe please attendance approve kardo."},
        {"intent": "AT02", "subject": "Shift roster swap request", "body": "Requesting to swap morning shift with night shift for this upcoming Wednesday."},
        {"intent": "AT02", "subject": "Shift change query", "body": "Need to adjust my shift timing for next week due to doctor appointment."},
        {"intent": "AT02", "subject": "Shift roaster change karwana hai", "body": "Next week mera shift evening se morning swap karna chahta hu."},
        {"intent": "AT03", "subject": "Overtime compensation claim", "body": "Logged 4 extra hours during the weekend product release. Submitting OT claim."},
        {"intent": "AT03", "subject": "Extra hours worked approval", "body": "Manager approved 3 hours OT on Saturday. Please reflect in portal."},
        {"intent": "AT03", "subject": "OT payout hours add nahi huye", "body": "Maine last weekend 5 ghante extra kaam kiya tha OT add kar do."},
        {"intent": "AT04", "subject": "Timesheet approval pending with manager", "body": "My weekly timesheet is still pending approval, payroll cycle is closing."},
        {"intent": "AT04", "subject": "Timesheet locked issue", "body": "Timesheet portal locked before I could submit Thursday hours."},
        {"intent": "AT05", "subject": "WFH log update request", "body": "Forgot to log Work From Home entry on Monday, portal showing absent."},
        {"intent": "AT05", "subject": "Work from home punch missing", "body": "Marked WFH in morning but status still showing as half-day absent."},
        {"intent": "AT06", "subject": "On Duty OD request for client visit", "body": "Visiting Gurugram warehouse for audit today, please approve OD status."},
        {"intent": "AT06", "subject": "On-duty application pending", "body": "Was attending official training outside office yesterday, approve OD."},
        {"intent": "AT07", "subject": "Late mark deduction waiver", "body": "Late by 15 mins due to metro line breakdown. Kindly waive late penalty."},
        {"intent": "AT07", "subject": "Half day mark lag gaya late aane pe", "body": "Traffic jam tha 10 min late hua half day cut ho gaya waiver dedo please."},
        {"intent": "AT08", "subject": "Comp-off credit request", "body": "Worked on national holiday, requesting comp-off credit to my quota."},
        {"intent": "AT08", "subject": "Comp off balance verify", "body": "Last Sunday working ka comp off add nahi hua abhi tak."}
    ],
    "PAYROLL": [
        {"intent": "PR01", "subject": "Salary credit delay", "body": "Salary has not been credited to my HDFC account yet for this month."},
        {"intent": "PR01", "subject": "Sir salary nahi aayi abhi tak", "body": "Everyone in my team got salary message but my account balance has not updated."},
        {"intent": "PR01", "subject": "Monthly payout pending", "body": "Please check why my monthly net pay was not processed in batch."},
        {"intent": "PR02", "subject": "Payslip download link not working", "body": "Unable to download current month payslip from HRMS portal."},
        {"intent": "PR02", "subject": "Salary slip discrepancy in HRA", "body": "HRA allowance on this month payslip is lower than my offer letter."},
        {"intent": "PR02", "subject": "Payslip me deduction galat dikha raha hai", "body": "Sir please check salary slip extra cut ho gaya amount."},
        {"intent": "PR03", "subject": "Form 16 mismatch with 26AS", "body": "TDS amount in Part A of Form 16 doesn't match Income Tax portal 26AS."},
        {"intent": "PR03", "subject": "Excess TDS deducted this month", "body": "Submitted 80C investment proofs but high TDS was deducted in payroll."},
        {"intent": "PR03", "subject": "Form 16 download and tax deduction", "body": "Form 16 generate karke dedo tax return file karni hai."},
        {"intent": "PR04", "subject": "PF UAN passbook update query", "body": "Employer PF contribution is not reflecting in EPFO portal passbook."},
        {"intent": "PR04", "subject": "Provident fund transfer from previous company", "body": "Need assistance linking old company PF account to current Tata 1mg UAN."},
        {"intent": "PR05", "subject": "Bank account details update for salary", "body": "Changed my salary account to ICICI Bank. Attached cancelled cheque."},
        {"intent": "PR05", "subject": "Salary bank account change karwana hai", "body": "Mera account SBI se ICICI switch karna hai salary credit ke liye."},
        {"intent": "PR06", "subject": "Broadband and internet expense reimbursement", "body": "Submitted WFH internet bills two weeks ago, reimbursement pending."},
        {"intent": "PR06", "subject": "Travel expense voucher approval", "body": "Local conveyance claim voucher #4928 is pending finance clearance."},
        {"intent": "PR07", "subject": "Annual variable pay bonus query", "body": "When will performance variable bonus be credited in our payroll?"},
        {"intent": "PR07", "subject": "Bonus amount calculation", "body": "Variable incentive payout is less than communicated rating percentage."},
        {"intent": "PR08", "subject": "Full and Final settlement FnF query", "body": "My last working day was 15 days ago, please provide FnF statement."},
        {"intent": "PR08", "subject": "FnF clearance and gratuity payout", "body": "Please share breakdown of gratuity and leave encashment in settlement."}
    ],
    "PEOPLEDESK": [
        {"intent": "PD01", "subject": "Annual leave quota balance mismatch", "body": "Portal shows only 4 privilege leaves remaining while I took only 2 days."},
        {"intent": "PD01", "subject": "Sick leave balance update", "body": "Was on medical leave for 3 days with doctor certificate, update quota."},
        {"intent": "PD01", "subject": "Chutti balance check karwana hai", "body": "Mera casual leave balance portal me galat show ho raha hai."},
        {"intent": "PD02", "subject": "Maternity leave policy and benefit query", "body": "Requesting details on 26-week maternity leave entitlement and documentation."},
        {"intent": "PD02", "subject": "Paternity leave application submission", "body": "Applying for 10 days paternity leave starting next Monday."},
        {"intent": "PD03", "subject": "Mediclaim health insurance card download", "body": "Need TPA health card for hospital admission of my dependent mother."},
        {"intent": "PD03", "subject": "Add newborn baby to group medical insurance", "body": "Attached birth certificate to enroll child into company health policy."},
        {"intent": "PD04", "subject": "Tata 1mg employee handbook HR policy query", "body": "Need clarification on notice period buyout and probation review rules."},
        {"intent": "PD05", "subject": "Company holiday calendar for next quarter", "body": "Are optional festive holidays applicable for warehouse operations staff?"},
        {"intent": "PD06", "subject": "Internal job transfer IJP request", "body": "Seeking guidance on applying for internal job posting in operations."},
        {"intent": "PD07", "subject": "POSH prevention of sexual harassment confidential query", "body": "Need to discuss confidential workplace safety matter with IC committee."},
        {"intent": "PD08", "subject": "Employment verification letter for Schengen visa", "body": "Travelling abroad next month, need official employment and salary letter."}
    ],
    "IT_ASSET": [
        {"intent": "IT01", "subject": "Laptop blue screen crash and reboot loop", "body": "My work ThinkPad is crashing with BSOD error every 20 minutes."},
        {"intent": "IT01", "subject": "MacBook battery swelling issue", "body": "MacBook Pro trackpad is unresponsive and battery warning says Service Recommended."},
        {"intent": "IT01", "subject": "Laptop screen flicker and shutdown", "body": "Display went blank suddenly, unable to turn on laptop."},
        {"intent": "IT02", "subject": "Fortinet VPN connection timed out", "body": "Unable to connect to internal staging servers via company VPN."},
        {"intent": "IT02", "subject": "VPN login failing with authentication error", "body": "FortiToken 2FA not accepting OTP code on VPN client."},
        {"intent": "IT03", "subject": "Google Workspace Gmail password reset", "body": "Locked out of 1mg.com corporate email after password expiration."},
        {"intent": "IT03", "subject": "Slack 2FA authentication locked", "body": "Lost phone authenticator app, please reset Slack multi-factor token."},
        {"intent": "IT04", "subject": "Docker Desktop and PyCharm license request", "body": "Need developer license activated on my local development workstation."},
        {"intent": "IT05", "subject": "Replacement charger and mouse needed", "body": "Type-C 65W charging adapter stopped working, need replacement unit."},
        {"intent": "IT06", "subject": "CrowdStrike antivirus update failing", "body": "IT security scanner is reporting outdated endpoint protection definitions."},
        {"intent": "IT07", "subject": "New joinee laptop provisioning request", "body": "New software engineer joining my squad Monday, laptop dispatch status."},
        {"intent": "IT08", "subject": "Asset handover clearance on resignation", "body": "Submitting laptop, monitor, and ID badge to IT desk for exit clearance."}
    ],
    "BGV": [
        {"intent": "BG01", "subject": "Degree marksheet verification pending", "body": "AuthBridge portal is showing graduation degree certificate unverified."},
        {"intent": "BG01", "subject": "Provisional degree certificate submission", "body": "Uploaded university provisional certificate as convocation is next year."},
        {"intent": "BG02", "subject": "Previous employer relieving letter discrepancy", "body": "Old company HR has not responded to BGV verification email for relieving date."},
        {"intent": "BG02", "subject": "Service letter dates mismatch query", "body": "Background check vendor flagged a 15-day gap between employment dates."},
        {"intent": "BG03", "subject": "Permanent residential address verification", "body": "Physical address verification agent visited when family was out of town."},
        {"intent": "BG04", "subject": "Police clearance certificate status", "body": "Submitted court and police verification documents for Delhi jurisdiction."},
        {"intent": "BG05", "subject": "AuthBridge BGV link expired", "body": "The document upload link received on my personal email has expired."},
        {"intent": "BG06", "subject": "Dual employment EPFO service overlap query", "body": "Clarification regarding freelance consulting during previous internship."},
        {"intent": "BG07", "subject": "Final BGV green report copy request", "body": "Need confirmation that my background verification is completed with clear status."},
        {"intent": "BG08", "subject": "Justification for previous employment gap", "body": "Submitting affidavit and medical proofs explaining 6-month career break."}
    ]
}

