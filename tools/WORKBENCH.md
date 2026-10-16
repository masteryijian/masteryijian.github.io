# OPC Business Workspace v2

Entry: `/tools/index.html`. The workbench now follows the business flow rather than listing independent tools.

## Available flows

1. Today: real open tasks, due CRM follow-ups, pending communications and active projects.
2. Customers/resources: read CRM companies and record people or product capabilities, source evidence and tags.
3. Communications: save notes and proposed next action; explicit confirmation creates one linked task. Repeated confirmation is idempotent. Customer archives are not automatically overwritten.
4. Needs/matching: record needs and constraints, compare exact capability tags, display hits and uncovered requirements. No fabricated confidence score or automatic claims of suitability.
5. Signals/briefs: distinguish sourced facts from business inference; create one CRM draft per signal. It does not send email.
6. Projects/delivery: customer association, deliverable, acceptance conditions, next milestone, target date and completion status.

Data key: `opc-workbench-v2`. CRM key: `opc-techbridge-crm-v2`. Data is browser-local on the same origin. The aggregate export contains workbench records and CRM data, so it may contain private business information. The workbench export is a data archive; an aggregate restore UI is not implemented yet. CRM still supports its own import/export.

Old tools remain in a collapsed auxiliary section. Their example data is not automatically imported. Automatic speech transcription, source monitoring, semantic matching, authenticated cloud storage and mail delivery are not connected to this static workbench. Other than explicitly creating a draft, no write is made to the CRM store.

Validation: 8 CRM tests and 7 workbench tests. The confirmation-to-task flow was also tested in the browser against local development data.
