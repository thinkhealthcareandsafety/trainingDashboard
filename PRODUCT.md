# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Think Health staff** (Ashish, Shikha, Sumit, Nikita, Anuj, Pranjal and others): run sales, quotations, trainings, AED and fulfilment from the internal dashboard at work.thinkhealth.in, daily, on laptops and phones.
- **Training coordinators at client organisations**, mostly big hotels: the person a hotel names to organise a CPR / First Aid / safety training. They log in to the Training Manager portal (training.thinkhealth.in) to see their trainings, propose a date and location, confirm headcount and build the participant list.
- **Participants**: hotel staff who scan a coordinator's QR code, mostly on Android phones, often on slow networks, in English. They register (name, phone, optional email) and then see when, where and what their training is.

## Product Purpose
Think Health (Pune, India) sells and delivers health and safety training (CPR, First Aid, AED, fire safety) and equipment. The Training Manager turns a training quotation into a shared workspace with the client: the coordinator confirms the training and organises attendees there, and Think Health sees it all live. Success means fewer emails and calls to schedule a training, an accurate attendee list before the day, and a client who feels it is dealing with a premium provider.

## Positioning
The client side of a training is managed on a Think Health-branded portal tied directly to the quote in Zoho Books: from the quote to the date, headcount, attendee list and participant self-registration by QR, without spreadsheets passed around by email.

## Operating Context
- Quotes are made in Zoho Books or on the dashboard. Training items are those in the Zoho item group "Training Services". Item names end with "(I)", which is never shown to clients. The item description holds everything the training includes.
- A coordinator is a Zoho contact person on the customer, with the designation "Training Coordinator".
- Portal email (logins, OTPs) is sent from learn@thinkhealth.in through Zoho Mail.
- Participants get IDs TH001, TH002 and so on, counted across all trainings.

## Capabilities and Constraints
- Stack: the existing Next.js app (custom version; read node_modules/next/dist/docs), MongoDB, Vercel, Zoho Books API.
- The portal runs inside the same app. training.thinkhealth.in needs a DNS record on Cloudflare plus the domain on Vercel; until then, it runs at work.thinkhealth.in/training/….
- Only training-only quotes (every item a training item) get a portal.
- The portal's first email keeps the quote PDF and adds the login.
- Undecided: confirm/accept flow details, PI creation, programme videos.

## Brand Commitments
- Match thinkhealth.in: the "think health" wordmark with "health" in a speech bubble. Deep petrol navy (~#034f72) and cerulean (~#0088c8). Logo PNGs are on Wix static (think-Health-Logo-1.png, ThinkHealth TM Logo).
- Owner's brief (10 Nov): clients are big hotels; the portal must look "elegant and fantastic", "as good as possible".
- Portal title: "Think Health Training Manager".

## Evidence on Hand
- Real training videos: the YouTube playlist linked from thinkhealth.in. Photos from sessions: owner to supply.
- Client hotel names and logos: owner has permission to show them, and will supply them.
- Social profiles: LinkedIn (linkedin.com/in/thinkhealth), Instagram (@think_health_india), YouTube playlist, Facebook (Think Health Care Pune), website thinkhealth.in.
- The AHA logo appears on thinkhealth.in. Show it only once the owner confirms the affiliation wording.
- No testimonials, numbers or claims exist yet. Do not invent any.

## Product Principles
1. The client should feel looked after: every screen reads like a hotel concierge note, not a back-office form.
2. Decisions belong to the coordinator: proposing, confirming and listing are one-tap and clearly theirs; Think Health confirms.
3. Participants need only the essentials: when, where, what, on any phone.
4. Nothing is invented: empty proof slots stay hidden until real material exists.

## Accessibility & Inclusion
Participants use low-end Android phones on slow networks: light pages, large tap targets, readable contrast, reduced motion respected (the welcome animation is skippable).
