# Policies

The organisation's rules that an idea must respect, checked at `/ai-sdlc:shape` before anything is built. They're about what the app does, not how the code looks (that's `REVIEW.md`). Engineer-owned: edit these to match your organisation, and ask legal, HR or security to confirm them.

Each policy has a short id, the rule, and what to do when an idea touches it. When an idea touches a policy, `/ai-sdlc:shape` records it under **Policy concerns** in the intent, and the engineer review checks the build against it.

## Starter policies (replace with your own)

- **personal-data-minimum.** Collect only the personal data the idea needs, and say why in the intent. *If touched:* list each personal field and its reason.
- **personal-data-retention.** Personal data isn't kept forever. The intent says how long, or when it's deleted. *If touched:* agree a retention period with the data owner.
- **sensitive-data.** Health, pay, performance ratings, ID numbers, bank details, religion or other special categories need the data owner's written OK before building. *If touched:* name the data owner, and don't build until they agree.
- **public-forms.** Public forms collect no more than name and contact details, never passwords or payment details, and are bot-protected. *If touched:* check the form's fields against this rule.
- **outside-services.** Data goes to another company's service (email, analytics, AI, storage) only if that service is on the approved list. *If touched:* name the service, and ask an engineer whether it's approved.
- **announcements.** Anything that emails, messages or notifies many people at once needs sign-off from the team that owns that audience. *If touched:* name who signs off.
- **records.** Apps that replace an official record (HR files, finance, contracts) need the record owner to agree that the app becomes the record. *If touched:* name the record owner.
