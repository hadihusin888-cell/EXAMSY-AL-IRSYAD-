# Security Specification - Examsy Security Rules

This security specification outlines the data invariants, test payloads, and requirements to protect our Firestore collections against data corruption and "Denial of Wallet" resource exhaustion attacks.

## 1. Data Invariants

*   **rooms**: Represents physical examp rooms.
    *   Fields: `id` (exact, numeric/string), `name`, `capacity`, `username`, `password`.
    *   No anonymous/unassigned custom fields.
    *   Capacity must be a positive integer.
*   **students**: Represents students taking the exam.
    *   Fields: `nis`, `name`, `class`, `password`, `status`, `roomId`, `violations`.
    *   `status` must be one of: `BELUM_MASUK`, `SEDANG_UJIAN`, `SELESAI`, `BLOKIR`.
    *   `violations` must be a non-negative integer.
*   **sessions**: Represents exam configurations.
    *   Fields: `id`, `name`, `class`, `pin`, `durationMinutes`, `isActive`, `questions`, `date`, optional `pdfUrl`.
    *   `questions` is an array of questions.
    *   `durationMinutes` represents duration in minutes (> 0).

## 2. The "Dirty Dozen" Malicious Payloads

The following payloads violate our schemas and must return `PERMISSION_DENIED`:

### Collection: `rooms`
1.  **Ghost Field (Shadow Update)**: `{"id": "R01", "name": "Room A", "capacity": 30, "username": "proctor1", "password": "123", "isVerifiedAdmin": true}`
2.  **Incorrect Type (Capacity as String)**: `{"id": "R01", "name": "Room A", "capacity": "30", "username": "proctor1", "password": "123"}`
3.  **String Overflow / Memory Injection**: `{"id": "R01", "name": "[10,000 character string]", "capacity": 30, "username": "proctor1", "password": "123"}`

### Collection: `students`
4.  **Shadow Status / Fake States**: `{"nis": "1001", "name": "Hadi", "class": "A", "password": "123", "status": "GRADUATED", "roomId": "R01", "violations": 0}`
5.  **Illegal Keys**: `{"nis": "1001", "name": "Hadi", "class": "A", "password": "123", "status": "BELUM_MASUK", "roomId": "R01", "violations": 0, "cheatMode": true}`
6.  **Violations Negative Boundary**: `{"nis": "1001", "name": "Hadi", "class": "A", "password": "123", "status": "BELUM_MASUK", "roomId": "R01", "violations": -1}`
7.  **NIS ID Poisoning**: `{"nis": "[5,000 character string]", "name": "Hadi", "class": "A", "password": "123", "status": "BELUM_MASUK", "roomId": "R01", "violations": 0}`

### Collection: `sessions`
8.  **Empty fields**: `{"id": "S01", "pin": "2026", "isActive": true}` (Missing mandatory fields)
9.  **Duration Overflow**: `{"id": "S01", "name": "Exam", "class": "A", "pin": "123", "durationMinutes": -10, "isActive": true, "questions": [], "date": "2026-06-08"}`
10. **Questions Array Size Overflow**: `{"id": "S01", "name": "Exam", "class": "A", "pin": "123", "durationMinutes": 60, "isActive": true, "questions": ["lots of junk entries to exhaust document space ... xxx"], "date": "2026-06-08"}`
11. **Type Mismatch (date as map)**: `{"id": "S01", "name": "Exam", "class": "A", "pin": "123", "durationMinutes": 60, "isActive": true, "questions": [], "date": {"day": 8, "month": 6}}`
12. **Missing PK Reference Integrity**: ID is null or missing.
