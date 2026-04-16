
import json

# Data from previous SQL queries
surgeries = [
    {"id": "7de91d72", "start_time": "07:30:00", "status": "completed", "operating_room_id": "301", "patient_name": "Ariza Antonio Nicolas"},
    {"id": "1a6c444f", "start_time": "09:00:00", "status": "completed", "operating_room_id": "301", "patient_name": "Saavedra Alicia"},
    {"id": "0a1ae739", "start_time": "11:50:00", "status": "completed", "operating_room_id": "301", "patient_name": "Cabeza Angel", "actual_end_time": "12:25:26"},
    {"id": "36b0db45", "start_time": "13:10:00", "status": "scheduled", "operating_room_id": "301", "patient_name": "Nonidas Cyntia", "ortho_validated": True, "admission_validated": True, "or_validated": True, "surgery_date": "2026-02-09"},
    {"id": "0b631d73", "start_time": "14:40:00", "status": "pending_validation", "operating_room_id": "301", "patient_name": "Suligoy Ignacio"}
]

rooms = [{"id": "301", "name": "Quirófano 1(General)", "active": True}]

# Current Time: 12:53
curH = 12
curM = 53
currentTotalMinutes = curH * 60 + curM

# 1. Auto-transition logic (simplified from Monitor.tsx)
for s in surgeries:
    sxHours, sxMinutes = map(int, s["start_time"].split(":")[:2])
    sxStartTotalMinutes = sxHours * 60 + sxMinutes
    
    # Visual Promotion
    if s["status"] in ["pending_validation", "waiting_date", "scheduled"]:
        if s.get("ortho_validated") and s.get("admission_validated") and s.get("or_validated"):
            s["status"] = "scheduled"
    
    # Auto-Start
    if s["status"] in ["scheduled", "pending_validation"] and currentTotalMinutes >= sxStartTotalMinutes:
        s["status"] = "in_progress"

# 2. Process per room
for room in rooms:
    roomSurgeries = [s for s in surgeries if s["operating_room_id"] == room["id"]]
    
    currentSx = next((s for s in roomSurgeries if s["status"] in ["in_progress", "in_or", "delayed"]), None)
    
    # Completed Filter
    completedList = []
    for s in roomSurgeries:
        if s["status"] == "completed":
            endTime = s.get("actual_end_time") or s.get("end_time") or s["start_time"] # Fallback
            h, m = map(int, endTime.split(":")[:2])
            endTotal = h * 60 + m
            if currentTotalMinutes - endTotal <= 300:
                completedList.append(s)
                
    # Next finding
    nextSx = None
    if currentSx:
        idx = roomSurgeries.index(currentSx)
        nextSx = next((s for s in roomSurgeries[idx+1:] if s["status"] in ["scheduled", "pending_validation"]), None)
    else:
        nextSx = next((s for s in roomSurgeries if s["status"] in ["scheduled", "pending_validation"]), None)

    print(f"Room: {room['name']}")
    print(f"  Current: {currentSx['patient_name'] if currentSx else 'None'}")
    print(f"  Next: {nextSx['patient_name'] if nextSx else 'None'}")
    print(f"  Completed: {[s['patient_name'] for s in completedList]}")
