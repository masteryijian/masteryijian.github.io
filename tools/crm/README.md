# OPC CRM v2

Live entry: `/tools/crm/index.html`.

A clean browser-local customer desk for GitHub Pages. No fake contacts, inferred confidence percentages, simulated recording analysis or fake monitoring feeds.

- Overview: real record counts and due follow-ups.
- Customers: company, contact, email, stage, next date, next action, notes and source.
- Research: separate unverified prospects; never counted as confirmed customers or subscribers.
- Follow-ups: date order, closed opportunities excluded.
- Briefs: local drafts and copy; no automatic email sending.
- Backup: JSON export and non-destructive import, with schema validation and conflict rejection.
- Legacy import: known demo contacts are excluded; old localStorage is preserved.

Storage key: `opc-techbridge-crm-v2`. Data remains in this browser and is not synced. Local storage is not an authenticated server-side database; use a trusted browser profile, export backups and avoid treating a shared browser as private access control.

The backend version is maintained separately in https://github.com/masteryijian/yijian. GitHub Pages cannot execute its Python or SMTP services.
