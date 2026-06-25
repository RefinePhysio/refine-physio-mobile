const app = document.querySelector("#app");
const AUTO_REFRESH_MS = 30000;
const AUTO_REFRESH_RENDER_TABS = new Set([
  "overview",
  "inbox",
  "adminReports",
  "referrals",
  "archived",
  "cliniko",
  "today",
  "rebook",
  "clients"
]);
const REPORT_PHOTO_LIMIT = 8;
const REPORT_PHOTO_MAX_EDGE = 1000;
const REPORT_PHOTO_QUALITY = 0.68;
const REPORT_PHOTO_MAX_DATA_URL_LENGTH = 900000;
let browserNavigationBound = false;

const state = {
  data: null,
  autoRefreshInFlight: false,
  foregroundSyncInFlight: false,
  attendanceSavingAppointmentIds: new Set(),
  lastForegroundSyncAt: 0,
  loginLoading: false,
  loginError: "",
  loginDestination: localStorage.getItem("refine-login-destination") || "schedule",
  forgotMessage: "",
  forgotMode: false,
  tab: new URLSearchParams(window.location.search).get("tab") || localStorage.getItem("refine-active-tab") || "",
  search: "",
  noteSearch: "",
  patientFileClientId: "",
  patientFileView: "details",
  adminArchivedAppointmentId: "",
  caseManagerProfileId: "",
  editReferralId: "",
  activeAppointmentId: "",
  expandedSignedNoteAppointmentId: "",
  calendarAppointmentId: "",
  calendarAppointmentMode: "details",
  calendarBookingStartLocal: "",
  calendarBookingClientId: "",
  calendarBookingPatientMode: "existing",
  unavailableBlocks: loadUnavailableBlocks(),
  unavailableBlockId: "",
  unavailableBlockStartLocal: "",
  unavailableBlockKind: "unavailable",
  rebookClientId: "",
  rebookFromAppointmentId: "",
  rebookSelectedStartLocal: "",
  rebookStatusClientId: "",
  approvalClientId: "",
  approvalAppointmentId: "",
  calendarMode: localStorage.getItem("refine-calendar-mode") || "day",
  calendarDateKey: localStorage.getItem("refine-calendar-date") || "",
  calendarMonthOffset: Number(localStorage.getItem("refine-calendar-month-offset") || 0),
  calendarMonthPickerOpen: false,
  ownerView: localStorage.getItem("refine-owner-view") || "admin",
  ownerPractitionerId: localStorage.getItem("refine-owner-practitioner") || "",
  noteOutcomeMeasures: {},
  reportClientId: "",
  reportContractorId: "",
  reportAppointmentId: "",
  reportReminderAppointmentId: "",
  reportDraftFields: {},
  reportDraftKey: "",
  reportDraftSummary: "",
  reportEquipmentTrialCount: 0,
  reportEquipmentOptionCounts: {},
  messageThreadUserId: "",
  onboardingSectionId: localStorage.getItem("refine-onboarding-section") || "welcome",
  reportType: "Initial Physiotherapy Assessment Report",
  tabMenuOpen: false,
  expandedReportReviewId: "",
  tabHistory: []
};

const adminTabs = [
  ["overview", "Overview"],
  ["inbox", "Approvals"],
  ["messages", "Messages"],
  ["users", "Users"],
  ["caseManagers", "Case managers"],
  ["adminReports", "Reports"],
  ["referrals", "Referrals"],
  ["archived", "Archived"],
  ["cliniko", "Cliniko"],
  ["handbook", "Handbook"]
];

const receptionistTabs = [
  ["overview", "Overview"],
  ["inbox", "Approvals"],
  ["messages", "Messages"],
  ["adminReports", "Reports"],
  ["referrals", "Referrals"],
  ["archived", "Archived"],
  ["handbook", "Handbook"]
];

const contractorTabs = [
  ["today", "Today"],
  ["clients", "Clients"],
  ["requests", "Approvals"],
  ["updates", "Updates"],
  ["messages", "Messages"],
  ["handbook", "Handbook"]
];

const onboardingSections = [
  {
    id: "welcome",
    number: "01",
    title: "Welcome to Refine",
    eyebrow: "Start here",
    image: "/onboarding-illustrations/diverse-physio-team.png",
    summary: "A warm introduction to who we are, what we value, and what makes Refine Physio Mobile different.",
    cards: [
      ["Our focus", "Deliver great care, communicate well, and treat every client with respect and compassion."],
      ["Who we are", "A mobile allied health team supporting people in homes, aged care settings, communities and workplaces."],
      ["The Refine Way", "Put clients first, be reliable, communicate early, document well, and keep learning."],
      ["What success looks like", "Care deeply, communicate clearly, complete documentation, work collaboratively and represent Refine professionally."]
    ],
    checklist: [
      "Read Katie's welcome message",
      "Understand the Refine mission, vision and values",
      "Know what the Refine client experience should feel like",
      "Ask early whenever something is unclear"
    ]
  },
  {
    id: "working",
    number: "02",
    title: "Working at Refine",
    eyebrow: "Daily expectations",
    image: "/onboarding-illustrations/01-team-bonding-diverse.png",
    summary: "The practical basics: compliance, communication, presentation, safety, privacy and how we stay connected as a team.",
    cards: [
      ["Before seeing clients", "Make sure your contractor agreement, AHPRA, ABN, insurance, checks, bank details and app access are complete."],
      ["Communication", "Respond to admin where possible within 1 business day and notify admin early about concerns, delays or schedule changes."],
      ["Team updates", "Telegram may be used for announcements, referral opportunities, training, operational updates and team culture."],
      ["Privacy", "Never share client-identifiable information in group chats, social media or personal storage."]
    ],
    checklist: [
      "Keep registrations, checks and insurances current",
      "Use approved communication channels",
      "Keep Telegram notifications on for important updates",
      "Maintain professional presentation and boundaries",
      "Tell admin immediately if you feel unsafe"
    ]
  },
  {
    id: "referrals",
    number: "03",
    title: "Referrals & Caseload",
    eyebrow: "Client journey",
    image: "/onboarding-illustrations/paediatric-family-support.png",
    summary: "How referrals are received, allocated and managed, and how clinicians manage ongoing scheduling and caseloads.",
    cards: [
      ["Admin starts the journey", "Administration gathers referral information, confirms funding and books initial assessments."],
      ["Your role after allocation", "Review referral information, attend the assessment, complete documentation and plan ongoing management."],
      ["Ongoing scheduling", "After the initial assessment, the treating physiotherapist manages ongoing appointments with the client."],
      ["Keep admin informed", "Tell admin about regular cancellations, discharges, significant changes or anything affecting billing or funding."]
    ],
    checklist: [
      "Review referral details before the first visit",
      "Consider referral recommendations and clinical needs",
      "Book future appointments where appropriate",
      "Group appointments geographically where possible",
      "Refer internally to OT or RMT when clinically useful"
    ]
  },
  {
    id: "leave-support",
    number: "04",
    title: "Leave, Illness & Support",
    eyebrow: "You are not alone",
    image: "/onboarding-illustrations/home-neuro-rehab.png",
    summary: "What to do when illness, leave, vehicle issues or unexpected circumstances affect appointments.",
    cards: [
      ["If unwell", "Do not attend client appointments if sick or contagious. Many clients are vulnerable."],
      ["Planned leave", "Provide as much notice as possible, ideally at least four weeks for planned leave."],
      ["Handovers", "Keep notes, goals, equipment recommendations, outstanding actions and concerns up to date."],
      ["Support", "Ask for help with clinical concerns, reports, funding questions, scheduling or difficult conversations."]
    ],
    checklist: [
      "Notify admin as soon as possible if appointments are affected",
      "Provide affected clients, dates and urgent concerns",
      "Keep documentation current before leave",
      "Trust your instincts around personal safety",
      "Reach out early instead of guessing"
    ]
  },
  {
    id: "documentation",
    number: "05",
    title: "Documentation & Reporting",
    eyebrow: "Clinical records",
    image: "/onboarding-illustrations/05-care-plan-tablet.png",
    summary: "How to write meaningful notes and reports that support care, funding, clinical reasoning and continuity.",
    cards: [
      ["Treatment notes", "Complete within 24 hours. Same-day notes are preferred where possible."],
      ["Initial reports", "Complete and submit within 2 business days of the assessment."],
      ["Equipment reports", "Complete and submit within 2 business days of the trial."],
      ["Good notes answer", "What did you do? Why did you do it? How did the client respond? What is the plan?"]
    ],
    checklist: [
      "Document assessment findings, treatment and client response",
      "Show progress toward goals and clinical reasoning",
      "Communicate report delays early",
      "Use admin review for signed-off reports",
      "Ask for support with complex reports"
    ]
  },
  {
    id: "clinical",
    number: "06",
    title: "Clinical Practice",
    eyebrow: "Care standards",
    image: "/onboarding-illustrations/hydrotherapy-session.png",
    summary: "The clinical principles behind safe, evidence-based, goal-directed and client-centred physiotherapy.",
    cards: [
      ["Goals", "Goals should be specific, meaningful, measurable and functional."],
      ["Falls", "Assess falls history, environment, mobility, balance and education needs where relevant."],
      ["Escalation", "Notify admin immediately for falls with injury, deterioration, safeguarding concerns or safety risks."],
      ["Equipment", "Consider safety, function, independence, client goals, environment and long-term suitability."]
    ],
    checklist: [
      "Work within scope and seek support when needed",
      "Use clinical reasoning in every session",
      "Trial equipment where appropriate before recommending",
      "Document equipment justification clearly",
      "Make every appointment purposeful"
    ]
  },
  {
    id: "resources",
    number: "07",
    title: "Consumables & Resources",
    eyebrow: "Tools for care",
    image: "/onboarding-illustrations/04-mobile-physio-driving.png",
    summary: "Supplies, templates, software, support and resources available to help clinicians deliver great care.",
    cards: [
      ["Consumables", "Refine may supply approved items such as Physiocrem, massage oil, resistance bands and printed resources."],
      ["Running low", "Tell admin early so supplies can be arranged before they run out."],
      ["Templates", "Use provided note, initial assessment, equipment trial and review templates where available."],
      ["Feedback", "Share ideas for better workflows, software improvements, documentation processes and client experience."]
    ],
    checklist: [
      "Request supplies before they run low",
      "Arrange collection or Bowen Hills pickup where applicable",
      "Use Refine Mobile and Cliniko as trained",
      "Ask for report writing support when needed",
      "Collaborate with the wider clinical team"
    ]
  },
  {
    id: "payments",
    number: "08",
    title: "Contractor Payments",
    eyebrow: "Simple process",
    image: "/onboarding-illustrations/05-care-plan-tablet.png",
    summary: "The simple payment workflow contractors need to know: statements, invoices, billable services and funding approvals.",
    cards: [
      ["Fortnightly payments", "Administration reviews billable appointments and approved reports at the end of each pay period."],
      ["Statements", "A contractor statement is prepared and sent to you for review."],
      ["Invoice", "You submit a matching tax invoice before payment is processed."],
      ["Travel", "At the time of publication, Refine does not bill travel. Contractors manage fuel, vehicle expenses and maintenance."]
    ],
    checklist: [
      "Review contractor statements carefully",
      "Submit a matching invoice",
      "Ask admin before proceeding if approval or funding is unclear",
      "Consider travel efficiency when booking",
      "Contact admin with statement questions"
    ]
  },
  {
    id: "conduct",
    number: "09",
    title: "Client Relationships & Conduct",
    eyebrow: "Trust and privacy",
    image: "/onboarding-illustrations/wheelchair-disability-physio.png",
    summary: "How we protect client relationships, privacy, confidentiality, professional boundaries and the Refine brand.",
    cards: [
      ["Our clients", "Clients introduced through Refine remain clients of Refine Physio Mobile."],
      ["Boundaries", "Do not provide personal phone numbers, personal emails or personal social media accounts to clients."],
      ["Confidentiality", "Protect client, referral partner, funding, pricing, operations and internal systems information."],
      ["Social media", "Do not post identifiable client information, photos or videos without appropriate consent."]
    ],
    checklist: [
      "Respect relationships introduced through Refine",
      "Communicate openly about conflicts of interest",
      "Use approved business channels",
      "Ask before taking or sharing photos/videos",
      "Notify admin promptly about complaints"
    ]
  },
  {
    id: "growth",
    number: "10",
    title: "Growth & Welcome",
    eyebrow: "The heart of Refine",
    image: "/onboarding-illustrations/06-team-celebration-diverse.png",
    summary: "A closing section about growth, professional development, feedback, meaningful work and being part of the Refine team.",
    cards: [
      ["Helping Refine grow", "Every positive interaction contributes to our reputation and creates more opportunities for clients and clinicians."],
      ["Professional development", "We encourage clinical discussion, mentoring, peer support, skill development and knowledge sharing."],
      ["Feedback", "Your ideas matter and help shape better systems, workflows and client experiences."],
      ["Why it matters", "Every appointment is more than a treatment session. The work we do can improve confidence, independence and quality of life."]
    ],
    checklist: [
      "Share referral opportunities with admin",
      "Keep learning and asking questions",
      "Suggest improvements when you see them",
      "Take pride in the difference you make",
      "Welcome to the Refine family"
    ]
  }
];

const onboardingArticleContent = {
  welcome: [
    {
      title: "A Personal Welcome from Katie",
      body: [
        "Hi and welcome to Refine Physio,",
        "I just wanted to take a moment to personally welcome you and say how excited we are to have you joining our team.",
        "Starting somewhere new can be both exciting and a little overwhelming, so before anything else, I want you to know that we're genuinely grateful you've chosen to be part of Refine Physio. We know there are many opportunities out there, and it means a lot that you've decided to join us on this journey.",
        "Refine Physio has always been more than just a physiotherapy business to me. It started from a passion for helping people live better lives and creating a workplace where clinicians feel supported, valued, and proud of the work they do. Over time, we've grown, but one thing has never changed: our people will always come first.",
        "When I think about the team we're building, I don't just think about clinicians seeing clients. I think about a group of kind, passionate people who genuinely care about making a difference in their communities. People who support one another, celebrate each other's wins, and work together to provide exceptional care for every client we meet.",
        "Whether you're seeing clients in their homes, in the community, or in our clinics, I want you to know that you're never doing it alone. Behind every appointment is a team that is here to support you. If you have questions, need advice, run into challenges, or simply want to bounce ideas around, please reach out. We are always happy to help.",
        "One of the things I love most about allied health is the impact we get to make every day. Sometimes it's helping someone walk further than they thought possible. Sometimes it's helping someone remain independent in their own home. Sometimes it's simply being a friendly face during a difficult period in someone's life. Those moments matter, and they are the reason we do what we do.",
        "As you settle in, my hope is that you'll feel welcomed, supported, and part of something meaningful. I want Refine Physio to be a place where you enjoy coming to work, where you can continue to grow professionally, and where you feel genuinely appreciated for the work you do.",
        "Thank you for joining us and for trusting us with this next chapter of your career. We are incredibly lucky to have you on board, and I truly look forward to getting to know you and watching you thrive as part of our team.",
        "Welcome to the Refine Physio family."
      ],
      image: "/onboarding-illustrations/katie-writing-welcome.png",
      signature: ["With gratitude,", "Katie Hsiao", "Founder & Director", "Refine Physio"],
      quote: "Alone we can do so little; together we can do so much.",
      highlight: true
    },
    {
      title: "Meet the Refine team",
      body: [
        "One of the greatest strengths of Refine Physio Mobile is our team. While every clinician brings their own experience, skills and personality, we all share the same goal: to provide exceptional care and make a meaningful difference in the lives of our clients."
      ],
      bullets: [
        "Physiotherapists provide evidence-based assessment, treatment and rehabilitation.",
        "Occupational Therapists support equipment prescriptions, home modifications, functional assessments and independence.",
        "Remedial Massage Therapists provide soft tissue treatment, pain management and recovery support.",
        "Administration supports referrals, scheduling, reports, invoicing, communication and daily operations."
      ],
      image: "/onboarding-illustrations/diverse-physio-team.png"
    },
    {
      title: "Who we are",
      body: [
        "Refine Physio Mobile was built on a simple belief: great physiotherapy should be accessible, personal and delivered where it matters most.",
        "Many clients face barriers accessing traditional clinic-based services. By bringing physiotherapy directly into homes, aged care facilities, communities and workplaces, we are able to provide care where clients feel most comfortable."
      ],
      bullets: ["NDIS participants", "Home Care Package clients", "CHSP clients", "DVA, Medicare, WorkCover, NIISQ and private clients"],
      image: "/onboarding-illustrations/aged-care-group-exercise.png"
    },
    {
      title: "Mission, vision and values",
      body: [
        "Our mission is to improve quality of life through accessible, evidence-based physiotherapy delivered in the environments most meaningful to our clients.",
        "Our vision is to become Queensland's leading mobile allied health provider by delivering exceptional clinical outcomes, outstanding customer service and meaningful support to the communities we serve."
      ],
      bullets: ["Professionalism", "Reliability", "Communication", "Compassion", "Growth"]
    },
    {
      title: "The Refine Way",
      body: [
        "The Refine Way is how we approach our work every day. Put clients first, be reliable, communicate early, document well and keep learning.",
        "Documentation is not just paperwork. Good documentation protects clients, supports funding, demonstrates clinical reasoning, protects you professionally and supports continuity of care."
      ],
      image: "/onboarding-illustrations/paediatric-physio-play.png"
    },
    {
      title: "The Refine client experience",
      body: [
        "When a client chooses Refine Physio Mobile, they should feel heard, supported, respected, valued and confident.",
        "Clients are never just another appointment on the calendar. Every interaction matters."
      ],
      bullets: ["Heard", "Supported", "Respected", "Valued", "Confident"]
    }
  ],
  working: [
    {
      title: "Contractor compliance checklist",
      body: ["Before seeing clients on behalf of Refine Physio Mobile, please ensure all required documentation has been supplied and remains current."],
      bullets: ["Signed Contractor Agreement", "Current AHPRA registration", "ABN registration", "Professional Indemnity and Public Liability Insurance", "Valid driver's licence", "National Police Check", "NDIS Worker Screening Check", "Blue Card where applicable", "Bank account and emergency contact details", "Access to Cliniko and Refine Mobile"],
      image: "/onboarding-illustrations/05-care-plan-tablet.png"
    },
    {
      title: "Important contacts",
      body: [
        "One of our core values is communication. If you are unsure about something, please ask.",
        "Administration can assist with referrals, scheduling, service agreements, funding questions, invoicing, reports, client communication and general support.",
        "Clinical support is available for complex presentations, equipment recommendations, report writing guidance, clinical concerns and treatment planning."
      ]
    },
    {
      title: "Communication and response expectations",
      body: [
        "Good communication helps us provide a better experience for clients, maintain referral relationships and support one another as a team.",
        "Where possible, respond to administration messages within 1 business day, notify administration of significant client concerns as soon as possible, communicate anticipated report delays early and keep administration informed of major schedule changes."
      ],
      bullets: ["Tell admin if you are running behind", "Tell admin about complaints or concerns promptly", "Ask for support if unsure", "Early communication prevents most issues"]
    },
    {
      title: "Professional standards",
      body: [
        "Professionalism extends beyond clinical skills. It includes how we present ourselves, communicate and represent Refine.",
        "Contractors are expected to maintain a professional appearance, arrive on time wherever possible, act honestly and ethically, respect confidentiality, maintain boundaries and practise within scope."
      ],
      bullets: ["Refine branded shirt or polo", "Smart shorts, pants or skirt", "Professional closed-in footwear", "Neat and presentable appearance"],
      image: "/onboarding-illustrations/diverse-physio-team.png"
    },
    {
      title: "Vehicle expectations and mobile visits",
      body: [
        "Reliable transport is an important part of mobile physiotherapy. Contractors are responsible for maintaining a reliable, roadworthy vehicle, holding a valid driver's licence and managing their own fuel, insurance and vehicle expenses.",
        "Your safety is important. If you ever feel unsafe, leave the environment immediately, contact administration and contact emergency services if required."
      ],
      image: "/onboarding-illustrations/04-mobile-physio-driving.png"
    },
    {
      title: "Client communication and boundaries",
      body: [
        "Build positive relationships by being approachable, communicating clearly, listening actively, explaining treatment plans and setting realistic expectations.",
        "To maintain professional boundaries, clinicians should not provide personal mobile numbers, personal email addresses or personal social media accounts to clients."
      ]
    },
    {
      title: "Social media, photography and privacy",
      body: [
        "Client privacy must always be respected. Do not share client information on social media, discuss identifiable information publicly, upload client information to personal devices or cloud storage, or share photographs without consent.",
        "Photos and videos should only be taken when there is a legitimate clinical or business reason, appropriate consent has been obtained and Refine policies have been followed."
      ]
    },
    {
      title: "Team communication",
      body: [
        "Refine uses Telegram for team communication and announcements. It may be used for team updates, general announcements, referral opportunities, training opportunities, operational updates, clinic news and celebrating team achievements.",
        "Client-identifiable information should never be shared within group chats. Where client-specific discussions are required, communicate directly with administration through approved channels."
      ],
      image: "/onboarding-illustrations/06-team-celebration-diverse.png"
    }
  ],
  referrals: [
    {
      title: "How referrals work",
      body: [
        "Administration manages the referral process so clients are contacted promptly and services commence as quickly as possible.",
        "Referrals may come from support coordinators, home care providers, case managers, hospitals, GPs, existing clients, family members, allied health professionals and community organisations."
      ],
      image: "/onboarding-illustrations/paediatric-family-support.png"
    },
    {
      title: "Initial assessment scheduling",
      body: [
        "Administration is responsible for scheduling all initial assessments. When allocating referrals, administration will consider clinician availability, client location, travel requirements, clinical suitability, language requirements, funding source and client preferences where possible.",
        "Once scheduled, the appointment will be entered into Cliniko and Refine Mobile and allocated to the treating physiotherapist."
      ]
    },
    {
      title: "Your responsibilities following allocation",
      body: [
        "Once a referral has been allocated, the treating physiotherapist is responsible for reviewing referral information, reviewing previous reports where available, attending the assessment, completing documentation, recommending treatment frequency, identifying equipment requirements and planning ongoing management."
      ],
      bullets: ["Review referral details before the visit", "Complete assessment documentation thoroughly", "Recommend treatment frequency", "Identify equipment requirements", "Plan ongoing management"]
    },
    {
      title: "Understanding referral recommendations",
      body: [
        "Sometimes the referral source may request a preferred treatment frequency such as weekly physiotherapy, fortnightly physiotherapy, monthly physiotherapy, equipment assessment only or a review assessment.",
        "If you believe a significantly different frequency is clinically appropriate, communicate this with administration so expectations can be managed with the referral source."
      ]
    },
    {
      title: "Ongoing appointment scheduling",
      body: [
        "Administration gets the client started. You manage the ongoing clinical journey.",
        "Following the initial assessment, the treating physiotherapist is responsible for scheduling ongoing appointments with the client. This supports continuity of care and flexibility in managing your caseload."
      ],
      image: "/onboarding-illustrations/wheelchair-disability-physio.png"
    },
    {
      title: "Travel and caseload management",
      body: [
        "As a mobile physiotherapist, travel is an important part of your role. Effective scheduling helps maximise productivity while reducing unnecessary travel.",
        "Where possible, group appointments geographically and consider existing appointments nearby, travel time, peak traffic, client preferences and clinical urgency."
      ]
    },
    {
      title: "Appointment changes and client discharges",
      body: [
        "Appointment schedules may change due to client availability, clinician availability, public holidays, illness, emergencies or travel disruptions.",
        "Please keep administration informed if multiple appointments are rescheduled, a client cancels regularly, a client wishes to discontinue services, you need scheduling support or a change may affect billing or funding."
      ]
    },
    {
      title: "Working together across disciplines",
      body: [
        "Refine includes physiotherapists, occupational therapists and remedial massage therapists. If you feel a client may benefit from another service within Refine Physio Mobile, notify administration.",
        "Internal referrals can complement physiotherapy treatment and improve overall outcomes."
      ],
      image: "/onboarding-illustrations/diverse-physio-team.png"
    }
  ],
  "leave-support": [
    {
      title: "Illness, leave and unexpected circumstances",
      body: [
        "Life happens. Illness, family emergencies, vehicle issues and unexpected circumstances can affect your ability to attend appointments.",
        "If you are unable to attend a scheduled appointment, notify administration as soon as possible. The earlier we know, the more options we have to support the client and minimise disruption."
      ],
      image: "/onboarding-illustrations/home-neuro-rehab.png"
    },
    {
      title: "If you are unwell",
      body: [
        "If you are sick or believe you may be contagious, please do not attend client appointments.",
        "Many clients are older adults, immunocompromised individuals or people living with complex health conditions. Attending while unwell may place vulnerable clients at risk."
      ],
      bullets: ["Clients affected", "Appointment dates and times", "Urgent clinical concerns", "Expected return-to-work date if known"]
    },
    {
      title: "Planned leave",
      body: [
        "We encourage clinicians to maintain a healthy work-life balance. If you are planning annual leave or an extended period away, please provide administration with as much notice as possible.",
        "Where possible, we recommend providing at least four weeks' notice for planned leave."
      ]
    },
    {
      title: "Vehicle breakdowns and emergencies",
      body: [
        "If your vehicle breaks down or an emergency prevents you from attending appointments, notify administration immediately, provide details of affected appointments and work with administration to determine the best solution."
      ],
      image: "/onboarding-illustrations/04-mobile-physio-driving.png"
    },
    {
      title: "Continuity of care and shared care",
      body: [
        "Clients receive services through Refine Physio Mobile. While clients may develop strong relationships with individual clinicians, our clients remain clients of Refine Physio Mobile.",
        "This allows us to continue supporting clients during annual leave, illness, extended periods away, high caseload periods and geographic coverage requirements."
      ]
    },
    {
      title: "Handover expectations",
      body: [
        "If another clinician is covering your clients, make sure documentation is up to date, treatment goals are clearly documented, equipment recommendations are documented, outstanding actions are identified and clinical concerns are communicated.",
        "Good documentation allows another clinician to step in confidently and provide seamless care."
      ]
    },
    {
      title: "You are never on your own",
      body: [
        "You are never expected to know everything or manage difficult situations alone. If you are unsure about clinical presentations, equipment recommendations, report writing, funding questions, scheduling concerns, client complaints or difficult conversations, please ask.",
        "Seeking support is a sign of professionalism and commitment to providing the best possible care."
      ],
      image: "/onboarding-illustrations/06-team-celebration-diverse.png"
    }
  ],
  documentation: [
    {
      title: "Why documentation matters",
      body: [
        "Documentation is much more than a compliance requirement. Strong documentation supports client care, clinical reasoning, funding approvals, communication with stakeholders, continuity of care and professional accountability.",
        "For many referral partners, support coordinators and case managers, your documentation may be the only insight they have into the progress being made with a client."
      ],
      image: "/onboarding-illustrations/05-care-plan-tablet.png"
    },
    {
      title: "Clinical documentation standards",
      body: [
        "Treatment notes should accurately reflect assessment findings, treatment provided, client response, progress towards goals, clinical reasoning and ongoing recommendations.",
        "If a support coordinator, case manager or funding body read the note, they should clearly understand the value of the session and why ongoing physiotherapy is being provided."
      ]
    },
    {
      title: "Writing high quality treatment notes",
      body: [
        "Strong documentation does not mean writing lengthy notes. It means writing meaningful notes.",
        "A good treatment note should answer: what did you do, why did you do it, how did the client respond and what is the plan moving forward."
      ],
      bullets: ["What did you do?", "Why did you do it?", "How did the client respond?", "What is the plan moving forward?"]
    },
    {
      title: "Poor note versus strong note",
      body: [
        "Poor example: Exercises completed. Tolerated well.",
        "Strong example: Completed lower limb strengthening, sit-to-stand training and dynamic balance exercises. Client demonstrated improved transfer ability and required less upper limb support compared to previous sessions. Tolerated session well with nil increase in pain. Continue progression of lower limb strengthening and balance activities to support independence and reduce falls risk."
      ],
      highlight: true
    },
    {
      title: "Documentation timeframes",
      body: [
        "Treatment notes must be completed within 24 hours of every appointment. Where possible, complete notes on the same day.",
        "Initial assessment reports and equipment trial reports must be completed and submitted within 2 business days of the assessment or trial."
      ],
      bullets: ["Treatment notes: within 24 hours", "Initial assessment reports: within 2 business days", "Equipment trial reports: within 2 business days"],
      image: "/onboarding-illustrations/02-seated-exercise.png"
    },
    {
      title: "Report approval process",
      body: [
        "The process is: assessment completed, report written by clinician, report submitted to administration, administration reviews report, administration sends report to relevant stakeholders, funding approval or feedback received, clinician updated.",
        "This process ensures reports are distributed appropriately and communication with stakeholders remains consistent."
      ]
    },
    {
      title: "Equipment recommendations and report delays",
      body: [
        "Where equipment is being recommended, complete the assessment, trial equipment where appropriate, collect outcome measures, complete the report and submit to administration.",
        "If you anticipate being unable to meet documentation timeframes, notify administration early, provide an expected completion date and communicate any urgent concerns."
      ]
    }
  ],
  clinical: [
    {
      title: "Delivering high quality physiotherapy",
      body: [
        "Our goal is to provide evidence-based, client-centred physiotherapy that helps individuals improve function, maximise independence and achieve meaningful outcomes.",
        "Every client is unique. Treatment approaches may vary, but clinicians should focus on evidence-based practice, functional outcomes, goal-directed treatment, client-centred care, clear clinical reasoning and measurable progress."
      ],
      image: "/onboarding-illustrations/aged-care-group-exercise.png"
    },
    {
      title: "Goal setting",
      body: [
        "Goals help guide treatment planning, measure progress, improve motivation, support funding requests and demonstrate clinical value.",
        "Where possible, goals should be specific, meaningful, measurable and functional."
      ],
      bullets: ["Walk independently to the mailbox", "Improve confidence using stairs", "Reduce falls risk", "Improve transfer ability", "Return to community activities"]
    },
    {
      title: "Falls management",
      body: [
        "Many clients present with balance deficits, reduced mobility and increased falls risk. Falls prevention should remain a key consideration during assessment and treatment.",
        "Where appropriate, assess falls history, environmental risks, mobility and balance, implement prevention strategies, provide education and recommend equipment."
      ],
      image: "/onboarding-illustrations/wheelchair-disability-physio.png"
    },
    {
      title: "If a fall occurs",
      body: [
        "Assess injury, pain, mobility and need for medical review. Document the circumstances of the fall, findings and actions taken. Notify administration as soon as possible."
      ]
    },
    {
      title: "Clinical escalation",
      body: [
        "Notify administration immediately regarding falls with injury, hospital admissions, significant deterioration, safeguarding concerns, suspected abuse, aggressive behaviour, mental health concerns, emergencies or concerns regarding client safety."
      ],
      highlight: true
    },
    {
      title: "Equipment recommendations and process",
      body: [
        "Physiotherapists play an important role in identifying equipment needs that support safety, independence and function. Recommendations may include walking sticks, four wheel walkers, rollators, electric beds, bed rails, recliners, pressure cushions and transfer aids.",
        "When equipment is being considered, follow a structured process: assessment, trial, clinical justification, report, administration review, stakeholder communication, approval process, delivery and follow up."
      ],
      image: "/onboarding-illustrations/hydrotherapy-session.png"
    },
    {
      title: "Clinical reasoning and value",
      body: [
        "Strong physiotherapy involves understanding why the client is receiving physiotherapy, what limitations are affecting daily life, what barriers are preventing goals and what interventions are likely to create meaningful improvements.",
        "Every appointment should have a purpose. Not every session needs to result in major change, but every session should contribute to the client's overall goals and treatment plan."
      ]
    }
  ],
  resources: [
    {
      title: "Supporting you to deliver great care",
      body: [
        "Refine wants clinicians to have the tools, resources and support required to provide exceptional physiotherapy services.",
        "While contractors manage their own vehicle, travel and registrations, Refine provides support through systems, resources and approved consumables where required."
      ],
      image: "/onboarding-illustrations/paediatric-physio-play.png"
    },
    {
      title: "Consumables and clinical supplies",
      body: [
        "Refine may supply standard clinical consumables required to provide physiotherapy services. Availability may vary depending on client needs and business requirements."
      ],
      bullets: ["Physiocrem", "Massage oil", "Resistance bands", "Therabands", "Printed exercise programs", "Clinical education resources"]
    },
    {
      title: "Running low or ordering consumables",
      body: [
        "If you are running low on consumables, let administration know early. We would much rather order supplies before you run out than have you without the resources you need.",
        "To order, contact administration, advise what items are required and provide approximate quantities where known."
      ]
    },
    {
      title: "Collecting consumables and Bowen Hills access",
      body: [
        "Consumables can be collected by arranging a collection time with administration or collecting directly from the Bowen Hills clinic.",
        "The Bowen Hills clinic acts as a central hub for administration, equipment, supplies and team support."
      ],
      image: "/onboarding-illustrations/04-mobile-physio-driving.png"
    },
    {
      title: "Refine Mobile and Cliniko",
      body: [
        "Refine Mobile has been developed to simplify appointment management, patient information, treatment notes, report generation, scheduling, communication and clinical workflows.",
        "Cliniko remains an important part of operations for reviewing appointments, referral information, client records, reports and scheduling where required.",
        "The Refine Mobile quick start PDF is available in this handbook and includes screenshots for the main practitioner workflows."
      ],
      bullets: ["Book appointments", "Rebook patients", "Use maps and phone links", "Send late notices to admin", "Complete notes and reports", "Ask admin for approval", "Message admin and read updates"],
      link: ["/practitioner-quick-start-guide.pdf", "Open software guide PDF"]
    },
    {
      title: "Resources, templates and report support",
      body: [
        "Resources available may include administrative support, clinical mentoring, documentation support, equipment guidance, software support, report writing support, internal referrals and team collaboration.",
        "Refine provides clinical templates such as initial assessment templates, progress note templates, equipment trial report templates, review report templates and documentation examples."
      ],
      image: "/onboarding-illustrations/05-care-plan-tablet.png"
    },
    {
      title: "Technology and continuous improvement",
      body: [
        "Our systems are designed to improve efficiency and reduce administrative burden. As the business grows, systems will continue to evolve.",
        "If you identify better ways of working, process improvements, software improvements, clinical improvements or client experience improvements, please share your ideas."
      ]
    }
  ],
  payments: [
    {
      title: "Contractor payments",
      body: [
        "Payments are processed on a fortnightly basis. At the end of each pay period, administration reviews completed billable appointments and approved reports, prepares a contractor statement and sends it to you.",
        "You review the statement and submit a matching tax invoice. Payment is then processed."
      ],
      image: "/onboarding-illustrations/05-care-plan-tablet.png"
    },
    {
      title: "Billable services",
      body: ["Generally, billable services may include initial assessments, treatment sessions, approved reports, approved equipment trial reports and other approved services where applicable."]
    },
    {
      title: "Travel",
      body: [
        "At the time of publication, Refine Physio Mobile does not bill travel.",
        "Contractors are responsible for fuel costs, vehicle expenses and vehicle maintenance. We encourage clinicians to consider travel efficiency and group appointments geographically where possible."
      ],
      image: "/onboarding-illustrations/04-mobile-physio-driving.png"
    },
    {
      title: "Non-billable appointments",
      body: [
        "Occasionally appointments may not be billable due to funding not approved, service agreement not signed, referral withdrawn, funding exhausted or an appointment completed before approval was obtained.",
        "If an appointment is identified as non-billable, administration will investigate the circumstances and discuss the matter with the clinician where required."
      ]
    },
    {
      title: "Funding approvals and communication",
      body: [
        "Administration manages service agreements, funding approvals and communication with support coordinators, case managers and funding bodies.",
        "If you are unsure whether services have been approved, funding is available, a report is billable or an appointment can proceed, contact administration before proceeding."
      ]
    }
  ],
  conduct: [
    {
      title: "Protecting relationships",
      body: [
        "Refine invests significant time, effort and resources into building relationships with clients, families, support coordinators, aged care providers, case managers and referral partners.",
        "As a contractor, you may be introduced to these relationships through the business. We ask that all contractors respect these relationships and act in good faith."
      ],
      image: "/onboarding-illustrations/05-case-manager-collaboration.png"
    },
    {
      title: "Our clients",
      body: [
        "Clients receive services through Refine Physio Mobile. While clients may develop strong relationships with individual clinicians, our clients remain clients of Refine Physio Mobile.",
        "This allows us to maintain continuity of care, support clients during leave, provide multidisciplinary services and continue services if circumstances change."
      ]
    },
    {
      title: "Non-solicitation",
      body: [
        "During and after your engagement with Refine, you must not encourage a Refine client to cease services, request that a client transfer services to you personally or another provider, solicit referrals from Refine referral partners for your own business interests or use information obtained through Refine for personal commercial gain."
      ],
      highlight: true
    },
    {
      title: "Existing clients and conflict of interest",
      body: [
        "This section does not apply to genuine pre-existing clients who were already receiving services from you before joining Refine Physio Mobile.",
        "Refine does not seek to restrict clinicians from working elsewhere. However, clinicians must not use Refine clients, referral partners or confidential business information to build competing services."
      ]
    },
    {
      title: "Confidentiality and personal contact details",
      body: [
        "Confidential information relating to clients, referral partners, funding arrangements, pricing, business operations and internal systems must remain confidential during and after your engagement.",
        "Clinicians should not provide personal mobile numbers, personal email addresses or personal social media accounts to clients."
      ]
    },
    {
      title: "Professional boundaries, social media and privacy",
      body: [
        "Maintain professional boundaries by avoiding involvement in family disputes, personal financial matters, significant gifts, services outside approved arrangements and dual relationships where possible.",
        "Do not share client information on social media, discuss identifiable information publicly, upload client information to personal cloud storage or share photos and videos without consent."
      ],
      image: "/onboarding-illustrations/wheelchair-disability-physio.png"
    },
    {
      title: "Complaints and protecting the Refine brand",
      body: [
        "If a client complaint is received, remain professional, listen respectfully, avoid becoming defensive and notify administration as soon as possible.",
        "Every interaction contributes to the reputation of Refine Physio Mobile. Protecting relationships protects the opportunities that support our clients, referral partners and team."
      ]
    }
  ],
  growth: [
    {
      title: "Helping Refine grow",
      body: [
        "Many referrals come through word-of-mouth recommendations from clients, families, support coordinators, aged care providers and healthcare professionals.",
        "As clinicians, you are often the face of the business. The way we communicate, document, achieve outcomes and build relationships all contribute to Refine's reputation."
      ],
      image: "/onboarding-illustrations/06-team-celebration-diverse.png"
    },
    {
      title: "Referral opportunities",
      body: [
        "If you encounter situations where another person may benefit from Refine services, let administration know. This may include family members, friends of existing clients, other residents within facilities, support coordinators or home care providers seeking allied health support.",
        "We never expect clinicians to sell services. Our focus should remain on helping people."
      ]
    },
    {
      title: "Professional development",
      body: [
        "We encourage continuous learning and professional growth through continuing professional development, clinical discussion, mentoring, peer support, skill development and knowledge sharing.",
        "No matter how experienced you are, there is always something new to learn."
      ],
      image: "/onboarding-illustrations/diverse-physio-team.png"
    },
    {
      title: "Feedback and continuous improvement",
      body: [
        "Many of the systems used within Refine have been developed through feedback from clinicians and team members.",
        "If you identify opportunities to improve client experience, documentation, software systems, scheduling workflows, communication or clinical resources, please share your ideas."
      ]
    },
    {
      title: "Building something bigger",
      body: [
        "Refine Physio Mobile is still growing. Every clinician who joins us has an opportunity to help shape the future of the business.",
        "Our goal is to build a business that clients trust, families recommend, referral partners value and clinicians enjoy being part of."
      ]
    },
    {
      title: "Why we do what we do",
      body: [
        "Every appointment is more than a treatment session. For some clients, we may be the only healthcare professional they see regularly.",
        "We have the opportunity to improve confidence, independence, mobility, quality of life and help people achieve meaningful goals. The work we do matters."
      ],
      image: "/onboarding-illustrations/aged-care-group-exercise.png"
    },
    {
      title: "Welcome to the team",
      body: [
        "Thank you for choosing to be part of Refine Physio Mobile. We are excited to have you on the team and look forward to working with you.",
        "Together, we can continue making a meaningful difference in the lives of the people we support every day."
      ],
      bullets: ["Katie Hsiao", "Director | Physiotherapist"],
      highlight: true
    }
  ]
};

const physioOutcomeMeasures = [
  {
    id: "10mwt",
    label: "10MWT",
    reference: "Usual community ambulation is commonly around 0.8 m/s or higher; limited community ambulation is often below 0.8 m/s."
  },
  {
    id: "30secSts",
    label: "30 sec STS",
    reference: "Record total stands in 30 seconds. Compare against age and sex norms; lower scores indicate reduced lower-limb function."
  },
  {
    id: "tug",
    label: "TUG",
    reference: "Less than 10 seconds is usually freely mobile; 10-20 seconds is often independent; more than 20 seconds suggests higher mobility limitation."
  },
  {
    id: "bergBalance",
    label: "Berg Balance Scale",
    reference: "Score is out of 56. Scores below 45 are commonly associated with increased falls risk."
  },
  {
    id: "5xSts",
    label: "5x STS",
    reference: "Record time to complete five stands. More than 15 seconds is commonly used as a marker of increased falls risk in older adults."
  },
  {
    id: "4StageBalance",
    label: "4 stage balance test",
    reference: "Inability to hold tandem stance for 10 seconds is commonly associated with increased falls risk."
  },
  {
    id: "fes1",
    label: "Falls Efficacy Scale (FES-I)",
    reference: "Total score ranges from 16-64. Higher scores indicate greater concern about falling."
  },
  {
    id: "other",
    label: "Other",
    reference: "Custom measure entered by the practitioner. Add the relevant reference range or interpretation in the clinical note."
  }
];

init();
registerServiceWorker();

async function init() {
  registerBrowserNavigation();
  await loadData();
  startAutoRefresh();
  void syncClinikoForeground({ reason: "app_open", quiet: true });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}

async function loadData() {
  try {
    state.data = await fetchJson("/api/bootstrap");
    state.loginError = "";
    if (!state.data.reportTemplates.some((template) => template.type === state.reportType)) {
      state.reportType = state.data.reportTemplates[0]?.type || "Initial Physiotherapy Assessment Report";
    }
    const tabs = currentTabs();
    if (!tabs.some(([id]) => id === state.tab) && !hiddenTabs().includes(state.tab)) state.tab = tabs[0][0];
    syncBrowserHistory("replace");
    render();
    void markApprovalResultsSeenForCurrentTab();
  } catch (error) {
    if (error.status === 401) {
      state.data = null;
      renderLogin();
    } else {
      app.innerHTML = `<main class="page"><div class="error">${escapeHtml(error.message)}</div></main>`;
    }
  }
}

function startAutoRefresh() {
  window.setInterval(() => {
    void autoRefreshData();
  }, AUTO_REFRESH_MS);

  window.addEventListener("focus", () => {
    void syncClinikoForeground({ reason: "window_focus" });
    void autoRefreshData({ force: true });
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      void syncClinikoForeground({ reason: "visibility_return" });
      void autoRefreshData({ force: true });
    }
  });
}

async function syncClinikoForeground(options = {}) {
  if (!state.data?.clinikoConfig?.connected || state.foregroundSyncInFlight || document.hidden) return false;
  const now = Date.now();
  if (!options.force && now - state.lastForegroundSyncAt < 8000) return false;

  state.foregroundSyncInFlight = true;
  state.lastForegroundSyncAt = now;
  const previousDigest = appointmentDataDigest(state.data);
  try {
    await fetchJson("/api/cliniko/pulse", {
      method: "POST",
      body: { reason: options.reason || "foreground" }
    });
    const nextData = await fetchJson("/api/bootstrap");
    const nextDigest = appointmentDataDigest(nextData);
    state.data = nextData;

    if (!state.data.reportTemplates.some((template) => template.type === state.reportType)) {
      state.reportType = state.data.reportTemplates[0]?.type || "Initial Physiotherapy Assessment Report";
    }

    const tabs = currentTabs();
    if (!tabs.some(([id]) => id === state.tab) && !hiddenTabs().includes(state.tab)) state.tab = tabs[0][0];

    const changed = previousDigest !== nextDigest;
    if (changed && AUTO_REFRESH_RENDER_TABS.has(state.tab)) {
      render();
      void markApprovalResultsSeenForCurrentTab();
      if (!options.quiet) toast("Calendar updated from Cliniko");
    }
    return changed;
  } catch (error) {
    console.error(error);
    return false;
  } finally {
    state.foregroundSyncInFlight = false;
  }
}

async function autoRefreshData(options = {}) {
  if (!state.data || state.autoRefreshInFlight || document.hidden) return;
  if (!options.force && autoRefreshShouldPause()) return;

  state.autoRefreshInFlight = true;
  const previousDigest = appointmentDataDigest(state.data);
  try {
    const nextData = await fetchJson("/api/bootstrap");
    const nextDigest = appointmentDataDigest(nextData);
    state.data = nextData;

    if (!state.data.reportTemplates.some((template) => template.type === state.reportType)) {
      state.reportType = state.data.reportTemplates[0]?.type || "Initial Physiotherapy Assessment Report";
    }

    const tabs = currentTabs();
    if (!tabs.some(([id]) => id === state.tab) && !hiddenTabs().includes(state.tab)) state.tab = tabs[0][0];

    const appointmentDataChanged = previousDigest !== nextDigest;
    const shouldRender = appointmentDataChanged && AUTO_REFRESH_RENDER_TABS.has(state.tab);
    if (shouldRender || state.tab === "cliniko") {
      render();
      void markApprovalResultsSeenForCurrentTab();
      if (shouldRender) toast("Calendar updated from Cliniko");
    }
  } catch (error) {
    console.error(error);
  } finally {
    state.autoRefreshInFlight = false;
  }
}

function autoRefreshShouldPause() {
  if (state.calendarBookingStartLocal || state.unavailableBlockId || state.unavailableBlockStartLocal || state.reportReminderAppointmentId || state.patientFileClientId) return true;
  if (document.querySelector(".appointment-modal-backdrop")) return true;

  const active = document.activeElement;
  if (!active || active === document.body) return false;
  const tagName = active.tagName || "";
  return ["INPUT", "TEXTAREA", "SELECT"].includes(tagName) || active.isContentEditable;
}

function appointmentDataDigest(data) {
  if (!data) return "";
  const appointments = (data.appointments || [])
    .map((appointment) => ({
      id: appointment.id,
      clinikoId: appointment.clinikoId || "",
      clientId: appointment.clientId || "",
      contractorId: appointment.contractorId || "",
      startsAt: appointment.startsAt || "",
      endsAt: appointment.endsAt || "",
      appointmentType: appointment.appointmentType || "",
      recurrence: appointment.recurrence || "",
      status: appointment.status || "",
      syncStatus: appointment.syncStatus || "",
      clinikoUpdatedAt: appointment.clinikoUpdatedAt || ""
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const clients = (data.clients || [])
    .map((client) => ({
      id: client.id,
      name: client.name || "",
      phone: client.phone || "",
      address: client.address || "",
      suburb: client.suburb || "",
      clinikoUpdatedAt: client.clinikoUpdatedAt || ""
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const unavailableBlocks = (data.unavailableBlocks || [])
    .map((block) => ({
      id: block.id,
      contractorId: block.contractorId || "",
      startsAt: block.startsAt || "",
      endsAt: block.endsAt || "",
      startsAtLocal: block.startsAtLocal || "",
      endsAtLocal: block.endsAtLocal || "",
      label: block.label || "",
      kind: block.kind || "",
      syncStatus: block.syncStatus || "",
      clinikoUpdatedAt: block.clinikoUpdatedAt || ""
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify({ appointments, clients, unavailableBlocks });
}

function renderLogin() {
  app.innerHTML = `
    <main class="login-page">
      <section class="login-panel" aria-label="Sign in">
        <div class="login-brand text-brand-panel">
          <div class="brand-text-lockup brand-text-lockup-login" aria-label="Refine Physio Mobile">
            <span>Refine Physio</span><span>Mobile</span>
          </div>
          <p>Secure Refine app portal</p>
        </div>
        <div class="login-copy">
          <h2>${state.forgotMode ? "Reset Refine app access" : "Sign in to Refine"}</h2>
          <p>${state.forgotMode ? "This resets your Refine app password only." : "Use your Refine Physio Mobile account to open your schedule, handbook and assigned tools."}</p>
        </div>
        ${state.loginError ? `<div class="form-error" role="alert">${escapeHtml(state.loginError)}</div>` : ""}
        ${state.forgotMessage ? `<div class="form-success" role="status">${escapeHtml(state.forgotMessage)}</div>` : ""}
        ${state.forgotMode ? renderForgotPasswordForm() : renderLoginForm()}
      </section>
    </main>
  `;
  bindLoginEvents();
}

function renderLoginForm() {
  return `
    <form class="login-form" id="login-form">
      <div class="login-destination" role="group" aria-label="Choose where to open after sign in">
        <button type="button" class="login-destination-card ${state.loginDestination === "schedule" ? "active" : ""}" data-action="login-destination" data-destination="schedule" aria-pressed="${state.loginDestination === "schedule" ? "true" : "false"}">
          <strong>Open schedule</strong>
          <span>Calendar, appointments, notes, reports and messages.</span>
        </button>
        <button type="button" class="login-destination-card ${state.loginDestination === "handbook" ? "active" : ""}" data-action="login-destination" data-destination="handbook" aria-pressed="${state.loginDestination === "handbook" ? "true" : "false"}">
          <strong>Open handbook</strong>
          <span>Contractor onboarding, policies, workflows and guides.</span>
        </button>
      </div>
      <label>Email
        <input name="email" type="email" autocomplete="username" required>
      </label>
      <label>Password
        <input name="password" type="password" autocomplete="current-password" required>
      </label>
      <button type="submit" ${state.loginLoading ? "disabled" : ""}>
        ${state.loginLoading ? "Signing in..." : "Sign in"}
      </button>
      <p class="login-security-note">Access is based on your role. Practitioners only see the areas and clients assigned to them.</p>
      <button type="button" class="ghost" data-action="forgot-password">Forgot password?</button>
    </form>
  `;
}

function renderForgotPasswordForm() {
  return `
    <form class="login-form" id="forgot-password-form">
      <label>Email
        <input name="email" type="email" autocomplete="username" required>
      </label>
      <button type="submit" ${state.loginLoading ? "disabled" : ""}>
        ${state.loginLoading ? "Sending..." : "Request reset"}
      </button>
      <button type="button" class="ghost" data-action="back-to-login">Back to sign in</button>
    </form>
  `;
}

function render() {
  if (!state.data) {
    renderLogin();
    return;
  }
  const data = state.data;
  const user = data.currentUser;
  const isAdmin = user.role === "admin";
  const isOwner = canUseOwnerWorkspace();
  const practitionerView = ownerViewingPractitioner();
  const practitioner = currentCalendarPractitioner();
  const handbookView = state.tab === "handbook";
  const handbookProgress = onboardingProgress();

  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="topbar-inner">
          <div class="brand-lockup">
            <button type="button" class="brand-home-button" data-action="brand-home" aria-label="Go to home">
              <span class="brand-text-lockup brand-text-lockup-header" aria-label="Refine Physio Mobile">
                <span>Refine Physio</span><span>Mobile</span>
              </span>
            </button>
            <span class="brand-userline">${escapeHtml(user.name)} - ${escapeHtml(user.discipline)}</span>
          </div>
          <div class="top-actions ${isOwner ? "has-owner-switch" : ""}">
            <label class="top-search-control">
              <span>Search</span>
              <input id="global-search" type="search" value="${escapeHtml(state.search)}" placeholder="Client, suburb, referral">
            </label>
            ${isOwner ? renderOwnerViewSelect() : ""}
            <div class="account-actions">
              ${statusPill(isOwner ? "Owner" : roleLabel(user.role), user.role === "admin" ? "blue" : user.role === "receptionist" ? "gold" : "")}
              <button type="button" class="secondary" data-action="logout">Logout</button>
            </div>
          </div>
        </div>
      </header>

      <main class="page">
        <section class="identity-band">
          <div>
            <h2>${handbookView ? "Contractor onboarding handbook" : practitionerView ? `Practitioner view: ${escapeHtml(practitioner?.name || "Practitioner")}` : isAdmin ? "Mobile operations dashboard" : "Refine Physio Mobile Software"}</h2>
            <p>${handbookView ? "Learn the Refine way, mark sections complete, and keep key workflows close at hand." : practitionerView ? "Today's jobs, client records, notes, reports, and messages." : isAdmin ? "Approvals, reports, referrals, users, and Cliniko sync in one place." : "Welcome! We're so happy to have you on our team :)"}</p>
          </div>
          <div class="status-strip">
            ${handbookView ? statusPill(`${handbookProgress.completed}/${handbookProgress.total} complete`, handbookProgress.completed === handbookProgress.total ? "blue" : "gold") : statusPill(data.clinikoSync.status === "connected" ? "Cliniko connected" : "Cliniko pending", data.clinikoSync.status === "connected" ? "blue" : "gold")}
            ${statusPill(isOwner ? "Owner access" : isAdmin ? "Admin access" : "Assigned clients only")}
          </div>
        </section>

        ${handbookView ? "" : renderKpis()}
        ${renderTabs()}
        <section class="view" id="view">${renderView()}</section>
        ${renderAppointmentDetailModal()}
        ${renderCalendarBookingModal()}
        ${renderUnavailableBlockModal()}
        ${renderReportReminderModal()}
        ${renderPatientFileModal()}
        ${renderArchivedAppointmentDetailModal()}
        ${renderCaseManagerProfileModal()}
      </main>
    </div>
  `;

  bindEvents();
  void markVisibleMessagesRead();
}

function renderKpis() {
  const data = state.data;
  const practitionerMode = data.currentUser.role === "contractor" || ownerViewingPractitioner();
  const appointments = practitionerMode ? appointmentsForPractitioner(data.appointments) : data.appointments;
  const approvalRequests = practitionerMode
    ? (data.approvalRequests || []).filter((request) => request.contractorId === currentCalendarPractitionerId())
    : (data.approvalRequests || []);
  const incompleteNotes = appointments.filter((appointment) =>
    appointmentNotesDue(appointment) && dueBucket(appointment) !== "upcoming"
  ).length;
  const todayAppointments = appointmentsForDay(appointments, new Date()).filter((appointment) => appointment.status !== "cancelled");
  const patientsToday = new Set(todayAppointments.map((appointment) => appointment.clientId)).size;
  const reportsDue = appointments.filter((appointment) =>
    appointmentReportDue(appointment) && reportDueBucket(appointment) !== "upcoming"
  ).length;
  const activeApprovalItems = activeApprovalInboxItems(data.inboxItems || []).length;
  const reportReviewReminders = adminReportReminderReports().length;
  const unreadMessageCount = unreadDirectMessages().length;
  const newApprovals = unreadApprovalResultNotifications().length;
  const approvalInboxDue = activeApprovalRequests(approvalRequests).length;

  const kpis = [
    ["Patients today", patientsToday, "today"],
    ["Notes due", incompleteNotes, "notes-due"],
    ["Reports due", reportsDue, "reports-due"]
  ];

  if (["admin", "receptionist"].includes(data.currentUser.role) && !practitionerMode) {
    kpis.push(["Reports to review", reportReviewReminders, "adminReports"]);
    kpis.push(["Approvals", activeApprovalItems || approvalInboxDue, "inbox"]);
    kpis.push(["Unread messages", unreadMessageCount, "messages"]);
  } else {
    kpis.push(["Unread messages", unreadMessageCount, "messages"]);
    kpis.push(["New approval received", newApprovals, "requests"]);
  }

  return `<section class="kpi-grid">${kpis.map(([label, value, action]) => `<button class="kpi" data-action="kpi-nav" data-target="${action}"><strong>${value}</strong><span>${escapeHtml(label)}</span></button>`).join("")}</section>`;
}

function unreadApprovalResultNotifications() {
  return notificationsForPractitionerWorkspace().filter((item) => item.type === "approval_result" && !item.read);
}

function unreadDirectMessages() {
  return (state.data?.messages || []).filter((message) =>
    message.toUserId === state.data.currentUser.id
    && !(message.readBy || []).includes(state.data.currentUser.id)
  );
}

async function markApprovalResultsSeenForCurrentTab() {
  if (state.tab !== "requests" || state.data?.currentUser.role !== "contractor") return;

  const unread = unreadApprovalResultNotifications();
  if (!unread.length) return;

  const ids = unread.map((item) => item.id);
  const readAt = new Date().toISOString();
  unread.forEach((item) => {
    item.read = true;
    item.readAt = readAt;
  });
  render();

  try {
    await fetchJson("/api/notifications/read", {
      method: "PATCH",
      body: {
        userId: state.data.currentUser.id,
        ids,
        types: ["approval_result"]
      }
    });
  } catch (error) {
    console.error(error);
  }
}

async function markVisibleMessagesRead() {
  if (state.tab !== "messages" || !state.data?.currentUser) return;
  const threadUserId = visibleMessageThreadUserId();
  if (!threadUserId) return;
  const unread = unreadMessagesFromUser(threadUserId);
  if (!unread.length) return;

  const currentUserId = state.data.currentUser.id;
  unread.forEach((message) => {
    message.readBy ||= [];
    if (!message.readBy.includes(currentUserId)) message.readBy.push(currentUserId);
  });
  render();

  try {
    await fetchJson("/api/messages/read", {
      method: "PATCH",
      body: { fromUserId: threadUserId }
    });
  } catch (error) {
    console.error(error);
  }
}

function visibleMessageThreadUserId() {
  if (!state.data?.currentUser) return "";
  if (ownerViewingPractitioner()) return "";
  if (state.data.currentUser.role === "contractor") return adminUser()?.id || "";
  const users = messageThreadUsers();
  return selectedMessageThreadUser(users)?.id || "";
}

async function markNotificationRead(notificationId) {
  const notification = (state.data?.notifications || []).find((item) => item.id === notificationId);
  if (!notification || notification.read) return;

  notification.read = true;
  notification.readAt = new Date().toISOString();
  render();

  try {
    await fetchJson("/api/notifications/read", {
      method: "PATCH",
      body: {
        userId: state.data.currentUser.id,
        ids: [notificationId]
      }
    });
  } catch (error) {
    console.error(error);
  }
}

function renderTabs() {
  const tabs = currentTabs();
  const activeIndex = Math.max(0, tabs.findIndex(([id]) => id === state.tab));
  const activeLabel = tabLabel(state.tab) || tabs[activeIndex]?.[1] || "Menu";
  const previousTab = previousTabId();
  return `
    <div class="tab-shell ${state.tabMenuOpen ? "open" : ""}">
      <button class="tab-history-back" type="button" data-action="tab-back" ${previousTab ? "" : "disabled"} aria-label="Go back to previous page">
        Back
      </button>
      <button class="tab-menu-toggle" type="button" data-action="toggle-tab-menu" aria-expanded="${state.tabMenuOpen ? "true" : "false"}" aria-controls="section-tabs">
        <span>Menu</span>
        <strong>${escapeHtml(activeLabel)}</strong>
      </button>
      <nav class="tabs" id="section-tabs" aria-label="App sections">
        ${tabs.map(([id, label]) => `
          <button class="tab ${state.tab === id ? "active" : ""}" data-action="set-tab" data-tab="${id}" type="button">
            <span>${escapeHtml(label)}</span>
            ${tabBadgeCount(id) ? `<em class="tab-badge">${tabBadgeCount(id)}</em>` : ""}
          </button>
        `).join("")}
      </nav>
      <button class="tab-step tab-step-next" type="button" data-action="tab-step" data-step="1" ${tabs.length <= 1 ? "disabled" : ""} aria-label="Show more tabs">Next</button>
    </div>
  `;
}

function setActiveTab(tabId) {
  if (!tabId) return;
  rememberTab(state.tab);
  state.tab = tabId;
  state.tabMenuOpen = false;
  if (state.tab !== "messages") state.messageThreadUserId = "";
  localStorage.setItem("refine-active-tab", state.tab);
  syncBrowserHistory("push");
}

function rememberTab(tabId) {
  if (!tabId || tabId === state.tabHistory.at(-1)) return;
  state.tabHistory = [...state.tabHistory, tabId].slice(-10);
}

function previousTabId() {
  const validTabs = new Set([...currentTabs().map(([id]) => id), ...hiddenTabs()]);
  while (state.tabHistory.length && (!validTabs.has(state.tabHistory.at(-1)) || state.tabHistory.at(-1) === state.tab)) {
    state.tabHistory.pop();
  }
  return state.tabHistory.at(-1) || "";
}

function goBackToPreviousTab() {
  const previous = previousTabId();
  if (!previous) return;
  if (window.history.state?.refineApp && window.history.length > 1) {
    window.history.back();
    return;
  }
  state.tabHistory.pop();
  state.tab = previous;
  state.tabMenuOpen = false;
  if (state.tab !== "messages") state.messageThreadUserId = "";
  localStorage.setItem("refine-active-tab", state.tab);
  syncBrowserHistory("replace");
}

function registerBrowserNavigation() {
  if (browserNavigationBound) return;
  browserNavigationBound = true;
  window.addEventListener("popstate", (event) => {
    if (!state.data) return;
    const tabId = event.state?.refineApp
      ? event.state.tab
      : new URLSearchParams(window.location.search).get("tab");
    if (!tabIsAvailable(tabId)) return;
    state.tab = tabId;
    state.tabMenuOpen = false;
    state.calendarAppointmentId = "";
    state.calendarAppointmentMode = "details";
    state.patientFileClientId = "";
    state.patientFileView = "details";
    state.adminArchivedAppointmentId = "";
    state.caseManagerProfileId = "";
    state.expandedSignedNoteAppointmentId = "";
    if (state.tab !== "messages") state.messageThreadUserId = "";
    localStorage.setItem("refine-active-tab", state.tab);
    closeCalendarBooking();
    closeUnavailableBlock();
    closeReportReminder();
    render();
    void markApprovalResultsSeenForCurrentTab();
  });
}

function syncBrowserHistory(mode = "replace") {
  if (!state.tab || !tabIsAvailable(state.tab)) return;
  const url = new URL(window.location.href);
  url.searchParams.set("tab", state.tab);
  const payload = { refineApp: true, tab: state.tab };
  if (mode === "push" && window.history.state?.refineApp && window.history.state.tab === state.tab) return;
  if (mode === "push") window.history.pushState(payload, "", url);
  else window.history.replaceState(payload, "", url);
}

function tabIsAvailable(tabId) {
  if (!tabId) return false;
  return currentTabs().some(([id]) => id === tabId) || hiddenTabs().includes(tabId);
}

function tabLabel(tabId) {
  return new Map([
    ...adminTabs,
    ...receptionistTabs,
    ...contractorTabs,
    ["notes", "Notes"],
    ["reports", "Reports"],
    ["notesDue", "Notes due"],
    ["reportsDue", "Reports due"]
  ]).get(tabId) || "";
}

function tabBadgeCount(tabId) {
  const role = state.data?.currentUser?.role || "";
  const practitionerMode = role === "contractor" || ownerViewingPractitioner();
  if (tabId === "messages") return unreadDirectMessages().length;
  if (!["admin", "receptionist"].includes(role) || practitionerMode) return 0;
  if (tabId === "adminReports") return adminReportReminderReports().length;
  if (tabId === "inbox") {
    return activeApprovalInboxItems(state.data.inboxItems || []).length;
  }
  return 0;
}

function adjacentTabId(step) {
  const tabButtons = [...document.querySelectorAll("[data-action='set-tab']")];
  const tabIds = tabButtons.map((button) => button.dataset.tab).filter(Boolean);
  const fallbackIds = currentTabs().map(([id]) => id);
  const ids = tabIds.length ? tabIds : fallbackIds;
  const currentIndex = Math.max(0, ids.indexOf(state.tab));
  const nextIndex = Math.max(0, Math.min(ids.length - 1, currentIndex + step));
  return ids[nextIndex] || state.tab;
}

function onboardingCompletedIds() {
  try {
    const ids = JSON.parse(localStorage.getItem("refine-onboarding-completed") || "[]");
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

function setOnboardingCompletedIds(ids) {
  localStorage.setItem("refine-onboarding-completed", JSON.stringify([...ids]));
}

function onboardingProgress() {
  const completedIds = onboardingCompletedIds();
  const total = onboardingSections.length;
  const completed = onboardingSections.filter((section) => completedIds.has(section.id)).length;
  return {
    total,
    completed,
    percent: total ? Math.round((completed / total) * 100) : 0
  };
}

function currentOnboardingSection() {
  return onboardingSections.find((section) => section.id === state.onboardingSectionId) || onboardingSections[0];
}

function setOnboardingSection(sectionId) {
  if (!onboardingSections.some((section) => section.id === sectionId)) return;
  state.onboardingSectionId = sectionId;
  localStorage.setItem("refine-onboarding-section", sectionId);
}

function nextOnboardingSectionId() {
  const index = Math.max(0, onboardingSections.findIndex((section) => section.id === currentOnboardingSection().id));
  return onboardingSections[(index + 1) % onboardingSections.length]?.id || onboardingSections[0]?.id || "";
}

function scrollOnboardingContentToTop() {
  window.requestAnimationFrame(() => {
    const target = document.querySelector(".onboarding-content") || document.querySelector(".onboarding-hero");
    const offset = window.matchMedia("(max-width: 760px)").matches ? 8 : 16;
    const top = target ? target.getBoundingClientRect().top + window.scrollY - offset : 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({
      top: Math.max(0, top),
      behavior: reducedMotion ? "auto" : "smooth"
    });
  });
}

function scrollTabList(step = 1) {
  const tabs = document.querySelector("#section-tabs");
  if (!tabs) return;

  const style = window.getComputedStyle(tabs);
  if (style.display === "none") {
    state.tabMenuOpen = true;
    render();
    window.requestAnimationFrame(() => scrollTabList(step));
    return;
  }

  const isVerticalMenu = style.flexDirection === "column";
  const distance = isVerticalMenu
    ? Math.max(tabs.clientHeight * 0.75, 220)
    : Math.max(tabs.clientWidth * 0.75, 260);

  tabs.scrollBy({
    left: isVerticalMenu ? 0 : distance * step,
    top: isVerticalMenu ? distance * step : 0,
    behavior: "smooth"
  });
}

function renderView() {
  const role = state.data.currentUser.role;
  const isOperations = role === "admin" || role === "receptionist";
  const practitionerView = role === "contractor" || ownerViewingPractitioner();
  if (state.tab === "handbook") return renderOnboardingHub();
  if (practitionerView) {
    if (state.tab === "clients") return renderClients();
    if (state.tab === "rebook") return renderRebook();
    if (state.tab === "requests") return renderRequests();
    if (state.tab === "updates") return renderContractorUpdates();
    if (state.tab === "messages" && ownerViewingPractitioner()) return renderOwnerPractitionerMessagesPreview();
    if (state.tab === "messages") return renderContractorMessages();
    if (state.tab === "notes") return renderNotes();
    if (state.tab === "reports") return renderReports();
    if (state.tab === "notesDue") return renderNotesDueList();
    if (state.tab === "reportsDue") return renderReportsDueList();
    return renderContractorToday();
  }

  if (isOperations) {
    if (state.tab === "inbox") return renderAdminInbox();
    if (state.tab === "messages") return renderAdminMessages();
    if (state.tab === "users" && role === "admin") return renderUserManagement();
    if (state.tab === "caseManagers" && role === "admin") return renderCaseManagers();
    if (state.tab === "adminReports") return renderAdminReports();
    if (state.tab === "referrals") return renderAdminReferrals();
    if (state.tab === "archived") return renderAdminArchivedAppointments();
    if (state.tab === "schedule") return renderSchedule(true);
    if (state.tab === "notes") return renderNotes();
    if (state.tab === "reports") return renderReports();
    if (state.tab === "cliniko" && role === "admin") return renderCliniko();
    if (state.tab === "notesDue") return renderNotesDueList();
    if (state.tab === "reportsDue") return renderReportsDueList();
    return renderAdminOverview();
  }

  return renderContractorToday();
}

function onboardingArticleBlocks(section) {
  return onboardingArticleContent[section.id] || section.cards.map(([title, body]) => ({ title, body: [body] }));
}

function onboardingArticleBlockId(sectionId, index) {
  return `handbook-${sectionId}-${index + 1}`;
}

function titleCaseHandbookLabel(value) {
  const keepUpper = new Set(["ABN", "AHPRA", "CHSP", "DVA", "NDIS", "NIISQ", "OT", "OTs", "PDF", "RMT"]);
  return String(value || "")
    .split(/(\s+)/)
    .map((token) => {
      if (!token.trim()) return token;
      return token
        .split(/([-–—/])/)
        .map((part) => {
          if (!part || /^[-–—/]$/.test(part)) return part;
          if (keepUpper.has(part)) return part;
          return part.charAt(0).toUpperCase() + part.slice(1);
        })
        .join("");
    })
    .join("");
}

function onboardingSectionPalette(sectionId) {
  return {
    welcome: ["#0f8fbc", "#eef9fc"],
    working: ["#6374d8", "#f3f4ff"],
    referrals: ["#0f8f84", "#edf9f7"],
    "leave-support": ["#b96f33", "#fff5ec"],
    documentation: ["#0f6fb8", "#edf7ff"],
    clinical: ["#509433", "#f1faed"],
    resources: ["#c17b1d", "#fff7e8"],
    payments: ["#795cc9", "#f5f1ff"],
    conduct: ["#c45d7b", "#fff1f5"],
    growth: ["#087ea4", "#edf9fc"]
  }[sectionId] || ["#0f8fbc", "#eef9fc"];
}

function onboardingSectionVisuals(sectionId) {
  const shared = {
    welcome: [
      ["/onboarding-illustrations/katie-waving.png", "Welcome from Katie"],
      ["/onboarding-illustrations/diverse-physio-team.png", "Meet the team"],
      ["/onboarding-illustrations/06-team-celebration-diverse.png", "Refine culture"]
    ],
    working: [
      ["/onboarding-illustrations/01-team-bonding-diverse.png", "Team communication"],
      ["/onboarding-illustrations/04-mobile-physio-driving.png", "Mobile work"],
      ["/onboarding-illustrations/diverse-physio-team.png", "Professional team"]
    ],
    referrals: [
      ["/onboarding-illustrations/paediatric-family-support.png", "Family support"],
      ["/onboarding-illustrations/05-case-manager-collaboration.png", "Referral partners"],
      ["/onboarding-illustrations/wheelchair-disability-physio.png", "Client allocation"]
    ],
    "leave-support": [
      ["/onboarding-illustrations/home-neuro-rehab.png", "Continuity of care"],
      ["/onboarding-illustrations/06-team-celebration-diverse.png", "Team support"],
      ["/onboarding-illustrations/04-mobile-physio-driving.png", "Unexpected changes"]
    ],
    documentation: [
      ["/onboarding-illustrations/05-care-plan-tablet.png", "Documentation"],
      ["/onboarding-illustrations/aged-care-group-exercise.png", "Treatment notes"],
      ["/onboarding-illustrations/05-case-manager-collaboration.png", "Reports for stakeholders"]
    ],
    clinical: [
      ["/onboarding-illustrations/hydrotherapy-session.png", "Hydrotherapy"],
      ["/onboarding-illustrations/paediatric-physio-play.png", "Paediatrics"],
      ["/onboarding-illustrations/wheelchair-disability-physio.png", "Disability support"]
    ],
    resources: [
      ["/onboarding-illustrations/paediatric-physio-play.png", "Clinical resources"],
      ["/onboarding-illustrations/04-mobile-physio-driving.png", "Bowen Hills pickup"],
      ["/onboarding-illustrations/05-care-plan-tablet.png", "Software guide"]
    ],
    payments: [
      ["/onboarding-illustrations/05-care-plan-tablet.png", "Statements"],
      ["/onboarding-illustrations/04-mobile-physio-driving.png", "Travel planning"],
      ["/onboarding-illustrations/01-team-bonding-diverse.png", "Admin support"]
    ],
    conduct: [
      ["/onboarding-illustrations/05-case-manager-collaboration.png", "Professional relationships"],
      ["/onboarding-illustrations/wheelchair-disability-physio.png", "Client boundaries"],
      ["/onboarding-illustrations/diverse-physio-team.png", "Representing Refine"]
    ],
    growth: [
      ["/onboarding-illustrations/06-team-celebration-diverse.png", "Team culture"],
      ["/onboarding-illustrations/diverse-physio-team.png", "Professional growth"],
      ["/onboarding-illustrations/aged-care-group-exercise.png", "Meaningful care"]
    ]
  };
  return shared[sectionId] || shared.welcome;
}

function renderOnboardingArticle(section) {
  const blocks = onboardingArticleBlocks(section);
  return `
    <section class="onboarding-reader">
      <aside class="onboarding-topic-card" aria-label="Topics in this section">
        <span class="onboarding-eyebrow">In this section</span>
        <div class="onboarding-topic-list">
          ${blocks.map((block, index) => `
            <a href="#${escapeHtml(onboardingArticleBlockId(section.id, index))}">
              <span>${String(index + 1).padStart(2, "0")}</span>
              <strong>${escapeHtml(titleCaseHandbookLabel(block.title))}</strong>
            </a>
          `).join("")}
        </div>
      </aside>
      <div class="onboarding-article-flow">
        ${blocks.map((block, index) => `
          <section id="${escapeHtml(onboardingArticleBlockId(section.id, index))}" class="onboarding-article-block ${block.image ? "has-image" : ""} ${block.highlight ? "is-highlight" : ""}">
            <div class="onboarding-article-copy">
              <span class="onboarding-block-number">${String(index + 1).padStart(2, "0")}</span>
              <h4>${escapeHtml(block.title)}</h4>
              ${(block.body || []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
              ${block.bullets?.length ? `
                <ul>
                  ${block.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
                </ul>
              ` : ""}
              ${block.link?.length ? `<a class="button onboarding-block-link" href="${escapeHtml(block.link[0])}" target="_blank" rel="noreferrer">${escapeHtml(block.link[1])}</a>` : ""}
              ${block.signature?.length ? `
                <div class="onboarding-signature">
                  ${block.signature.map((line, lineIndex) => `<span class="${lineIndex === 1 ? "signature-name" : ""}">${escapeHtml(line)}</span>`).join("")}
                </div>
              ` : ""}
              ${block.quote ? `<blockquote>${escapeHtml(block.quote)}</blockquote>` : ""}
            </div>
            ${block.image ? `<img src="${escapeHtml(block.image)}" alt="">` : ""}
          </section>
        `).join("")}
      </div>
    </section>
  `;
}

function renderOnboardingResourcePanel() {
  return `
    <section class="onboarding-resource-panel">
      <div>
        <span class="onboarding-eyebrow">Practical software guide</span>
        <h3>Refine Mobile quick start PDF</h3>
        <p>Step-by-step screenshots for booking appointments, rebooking, maps, running late, notes, reports, approvals, messages, updates, client files and troubleshooting.</p>
      </div>
      <a class="button" href="/practitioner-quick-start-guide.pdf" target="_blank" rel="noreferrer">Open PDF guide</a>
    </section>
  `;
}

function renderOnboardingHub() {
  const activeSection = currentOnboardingSection();
  const progress = onboardingProgress();
  const completed = onboardingCompletedIds();
  const blocks = onboardingArticleBlocks(activeSection);
  const [sectionAccent, sectionSoft] = onboardingSectionPalette(activeSection.id);
  const nextSection = onboardingSections.find((section) => !completed.has(section.id)) || activeSection;
  return `
    <section class="onboarding-hub">
      <div class="onboarding-hero">
        <div class="onboarding-hero-copy">
          <span class="onboarding-eyebrow">Refine Contractor Handbook</span>
          <h3>Everything you need, in one supportive place.</h3>
          <p>A friendly, visual guide for contractors: read the essentials, open each topic, check your confidence points, and come back whenever you need a refresher.</p>
          <div class="onboarding-hero-actions">
            <button type="button" data-action="onboarding-section" data-section-id="${escapeHtml(nextSection.id)}">
              ${progress.completed ? "Continue onboarding" : "Start onboarding"}
            </button>
            <a class="button secondary" href="/practitioner-quick-start-guide.pdf" target="_blank" rel="noreferrer">
              Open PDF guide
            </a>
          </div>
        </div>
        <div class="onboarding-hero-media">
          <img src="/onboarding-illustrations/diverse-physio-team.png" alt="Diverse Refine physiotherapy team illustration">
          <div class="onboarding-progress-card">
            <div>
              <strong>${progress.completed}/${progress.total}</strong>
              <span>sections complete</span>
            </div>
            <div class="onboarding-progress-track" aria-label="${progress.percent}% complete">
              <span style="width:${progress.percent}%"></span>
            </div>
          </div>
        </div>
      </div>

      <div class="onboarding-team-intro">
        <section class="onboarding-katie-card">
          <img src="/onboarding-illustrations/katie-waving.png" alt="Katie waving hello">
          <div>
            <span class="onboarding-eyebrow">Welcome from Katie</span>
            <h3>Hi, welcome to Refine.</h3>
            <p>We are genuinely excited to have you on the team. This portal is here to make the important things easy to find, easy to understand, and easy to come back to.</p>
            <strong>Katie Hsiao<br><span>Director | Physiotherapist</span></strong>
          </div>
        </section>

        <section class="onboarding-team-card">
          <img src="/onboarding-illustrations/diverse-physio-team.png" alt="Diverse Refine physiotherapists">
          <div>
            <span class="onboarding-eyebrow">Meet the team</span>
            <h3>Different clinicians, same Refine standard.</h3>
            <p>A diverse team supporting clients across home visits, community care, paediatrics, aged care and disability services.</p>
          </div>
        </section>

        <section class="onboarding-team-card">
          <img src="/onboarding-illustrations/hydrotherapy-session.png" alt="Physiotherapist supporting a hydrotherapy session">
          <div>
            <span class="onboarding-eyebrow">Clinical variety</span>
            <h3>Mobile care looks different every day.</h3>
            <p>From hydrotherapy to home rehab, every clinician has the support and systems to deliver great care.</p>
          </div>
        </section>

        <section class="onboarding-team-card">
          <img src="/onboarding-illustrations/paediatric-family-support.png" alt="Physiotherapist supporting a family and child">
          <div>
            <span class="onboarding-eyebrow">Client centred</span>
            <h3>Support for every stage of life.</h3>
            <p>The handbook reflects the full team and the people we support, not just one clinician or one setting.</p>
          </div>
        </section>
      </div>

      <div class="onboarding-layout">
        <aside class="onboarding-sidebar" aria-label="Handbook sections">
          <div class="onboarding-sidebar-heading">
            <strong>Onboarding</strong>
            <span>${progress.percent}% complete</span>
          </div>
          <div class="onboarding-section-list">
            ${onboardingSections.map((section) => `
              <button type="button" class="${section.id === activeSection.id ? "active" : ""}" data-action="onboarding-section" data-section-id="${escapeHtml(section.id)}">
                <span>${escapeHtml(section.number)}</span>
                <strong>${escapeHtml(section.title)}</strong>
                ${completed.has(section.id) ? "<em>Done</em>" : "<em>Open</em>"}
              </button>
            `).join("")}
          </div>
        </aside>

        <article class="onboarding-content" style="--section-accent:${escapeHtml(sectionAccent)};--section-soft:${escapeHtml(sectionSoft)}">
          <label class="onboarding-mobile-section-picker">
            <span>Choose handbook section</span>
            <select data-action="onboarding-mobile-section">
              ${onboardingSections.map((section) => `
                <option value="${escapeHtml(section.id)}" ${section.id === activeSection.id ? "selected" : ""}>
                  ${escapeHtml(section.number)} - ${escapeHtml(section.title)}
                </option>
              `).join("")}
            </select>
          </label>

          <div class="onboarding-content-header">
            <div>
              <span class="onboarding-eyebrow">${escapeHtml(activeSection.eyebrow)}</span>
              <h3>${escapeHtml(activeSection.title)}</h3>
              <p>${escapeHtml(activeSection.summary)}</p>
            </div>
            <img src="${escapeHtml(activeSection.image)}" alt="">
          </div>

          ${renderOnboardingArticle(activeSection)}

          <section class="onboarding-checklist-card onboarding-checkout-card">
            <div class="section-heading">
              <h3>Before you mark this section complete</h3>
              <span>${completed.has(activeSection.id) ? "Completed" : "Read then mark complete"}</span>
            </div>
            <ul class="onboarding-checklist onboarding-checkout-list">
              ${activeSection.checklist.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
            <div class="onboarding-actions">
              <button type="button" data-action="onboarding-complete" data-section-id="${escapeHtml(activeSection.id)}" class="${completed.has(activeSection.id) ? "secondary" : ""}">
                ${completed.has(activeSection.id) ? "Mark as not complete" : "Mark section complete"}
              </button>
              <button type="button" class="secondary" data-action="onboarding-next">
                Next section
              </button>
            </div>
          </section>

          <section class="onboarding-note">
            <strong>Need help?</strong>
            <span>If anything is unclear, message Katie or admin and we're always here to support you.</span>
          </section>

        </article>
      </div>
    </section>
  `;
}

function renderAdminOverview() {
  const data = state.data;
  const approvalRequests = activeApprovalRequests(filterItems(data.approvalRequests));
  const reportReviewItems = sortInboxItems(filterItems(data.inboxItems || []))
    .filter((item) => item.sourceType === "report_copy" && !["resolved", "closed"].includes(item.status));
  const reportReminders = adminReportReminderReports(filterItems(data.reports || []));
  const reportsDue = sortAppointments(filterItems(data.appointments)
    .filter((appointment) => appointmentReportDue(appointment) && reportDueBucket(appointment) !== "upcoming"));
  const incompleteNotes = sortAppointments(filterItems(data.appointments)
    .filter((appointment) => appointmentNotesDue(appointment) && dueBucket(appointment) !== "upcoming"));

  return `
    ${renderAdminReportReminderBanner(reportReminders)}
    <div class="overview-action-row">
      <section class="section overview-panel">
        <div class="section-heading"><h3>Approval requests</h3><span>${approvalRequests.length} active</span></div>
        <div class="overview-compact-grid overview-scroll-grid">
          ${approvalRequests.map(renderApprovalCard).join("") || emptyState("No active approval requests.")}
        </div>
      </section>
      <section class="section overview-panel">
        <div class="section-heading"><h3>Reports for admin review</h3><span>${reportReviewItems.length} waiting</span></div>
        <div class="overview-scroll-grid overview-review-list">
          ${reportReviewItems.map(renderOverviewReportReviewItem).join("") || emptyState("No signed reports are waiting for admin review.")}
        </div>
      </section>
    </div>
  `;
}

function renderAdminInbox() {
  const inboxItems = sortInboxItems(filterItems(approvalInboxItems(state.data.inboxItems || [])));
  const activeItems = inboxItems.filter((item) => !["resolved", "closed"].includes(item.status));
  const newItems = activeItems.filter((item) => item.status === "new");
  const inProgressItems = activeItems.filter((item) => item.status === "in_progress");
  const waitingItems = activeItems.filter((item) => item.status === "waiting");
  const resolvedItems = inboxItems.filter((item) => ["resolved", "closed"].includes(item.status));

  return `
    <section class="section">
      <div class="section-heading"><h3>Approvals</h3><span>${activeItems.length} active</span></div>
      <div class="inbox-summary">
        <article><strong>${newItems.length}</strong><span>New approvals</span></article>
        <article><strong>${inProgressItems.length}</strong><span>Being actioned</span></article>
        <article><strong>${waitingItems.length}</strong><span>Waiting with case manager</span></article>
        <article><strong>${resolvedItems.length}</strong><span>Resolved</span></article>
      </div>
      <div class="grid">
        ${activeItems.map(renderInboxItemCard).join("") || emptyState("No active approval requests. Equipment trial, ongoing physio, frequency change, and other case-manager approvals will appear here.")}
      </div>
    </section>
  `;
}

function renderAdminMessages() {
  const contractors = messageThreadUsers();
  const selectedUser = selectedMessageThreadUser(contractors);
  const thread = selectedUser ? messagesForThread(selectedUser.id) : [];
  const unreadCount = unreadDirectMessages().length;

  return `
    <section class="section">
      <div class="section-heading"><h3>Messages</h3><span>${unreadCount ? `${unreadCount} unread` : `${(state.data.messages || []).length} total`}</span></div>
      ${renderMessageInboxAlert(unreadCount)}
      <div class="chat-layout">
        <aside class="chat-thread-list" aria-label="Practitioner conversations">
          ${contractors.map((user) => {
            const latest = latestMessageForUser(user.id);
            const unread = unreadMessagesFromUser(user.id).length;
            return `
              <button type="button" class="${selectedUser?.id === user.id ? "active" : ""} ${unread ? "is-unread" : ""}" data-action="message-thread" data-user-id="${escapeHtml(user.id)}">
                <strong>${escapeHtml(user.name)}</strong>
                <span>${latest ? escapeHtml(latest.body) : "No messages yet"}</span>
                ${unread ? `<em>${unread} new</em>` : ""}
              </button>
            `;
          }).join("") || emptyState("No practitioner threads yet.")}
        </aside>
        <section class="chat-panel">
          ${selectedUser ? `
            ${renderChatHeader(selectedUser.name, unreadMessagesFromUser(selectedUser.id).length ? "New messages" : "Direct message", "Admin can reply to this practitioner here.")}
            ${renderMessageList(thread)}
            ${renderMessageForm(selectedUser.id, "Reply to practitioner")}
          ` : emptyState("Choose a practitioner conversation.")}
        </section>
      </div>
    </section>
  `;
}

function renderAdminReports() {
  const reports = completedReportsForAdmin(filterItems(state.data.reports || []));
  const reportReminders = adminReportReminderReports(reports);

  return `
    <section class="section">
      <div class="section-heading"><h3>Reports</h3><span>${reports.length} completed</span></div>
      ${renderAdminReportReminderBanner(reportReminders, "reports")}
      <div class="report-admin-list">
        ${reports.map(renderAdminReportRow).join("") || emptyState("No completed initial or equipment trial reports yet.")}
      </div>
    </section>
  `;
}

function adminReportReminderReports(reports = state.data?.reports || []) {
  return completedReportsForAdmin(reports)
    .filter((report) => !report.caseManagerSentAt)
    .sort((a, b) => new Date(b.adminCopySentAt || b.signedAt || b.updatedAt || b.createdAt || 0) - new Date(a.adminCopySentAt || a.signedAt || a.updatedAt || a.createdAt || 0));
}

function renderAdminReportReminderBanner(reports, context = "overview") {
  if (!reports.length) return "";
  const visibleReports = reports.slice(0, context === "reports" ? 2 : 3);
  return `
    <section class="admin-report-reminder" aria-live="polite">
      <div class="admin-report-reminder-main">
        <span>${reports.length}</span>
        <div>
          <h3>${reports.length === 1 ? "Report completed and waiting for admin" : "Reports completed and waiting for admin"}</h3>
          <p>Initial assessment and equipment trial reports stay here until admin reviews them and marks them sent to the case manager.</p>
        </div>
      </div>
      <div class="admin-report-reminder-list">
        ${visibleReports.map((report) => `
          <article>
            <strong>${escapeHtml(clientName(report.clientId))}</strong>
            <span>${escapeHtml(report.type)} - ${escapeHtml(userName(report.contractorId))} - ${formatDateTime(report.adminCopySentAt || report.signedAt || report.updatedAt || report.createdAt)}</span>
          </article>
        `).join("")}
      </div>
      <div class="actions">
        <button type="button" data-action="set-tab" data-tab="adminReports">Review reports</button>
      </div>
    </section>
  `;
}

function renderCaseManagers() {
  const caseManagers = filterItems(state.data.caseManagers || []);
  const clients = filterItems(state.data.clients || []).sort((a, b) => clientName(a.id).localeCompare(clientName(b.id)));

  return `
    <section class="section">
      <div class="section-heading"><h3>Case managers</h3><span>${caseManagers.length} saved</span></div>
      <form class="card form-grid compact-form" id="case-manager-form">
        ${input("name", "Name", "text", true)}
        ${input("email", "Email", "email")}
        ${input("mobile", "Mobile", "tel")}
        ${companyInput("organisation", "Company / provider")}
        ${textarea("notes", "Notes", "full")}
        ${renderCompanyDatalist()}
        <div class="form-actions full">
          <button type="submit">Save case manager</button>
        </div>
      </form>
    </section>
    <section class="section">
      <div class="section-heading"><h3>Saved case managers</h3><span>Edit contact details</span></div>
      <div class="grid cards-3">
        ${caseManagers.map(renderCaseManagerCard).join("") || emptyState("No case managers saved yet.")}
      </div>
    </section>
    <section class="section">
      <div class="section-heading"><h3>Assign to patients</h3><span>${clients.length} patients</span></div>
      <div class="overview-list">
        ${clients.map(renderPatientCaseManagerRow).join("") || emptyState("No patients found.")}
      </div>
    </section>
  `;
}

function renderCaseManagerCard(caseManager) {
  const assignedCount = caseManagerProfilePatients(caseManager.id).length;
  return `
    <form class="card form-grid compact-form case-manager-card" data-case-manager-edit-form data-id="${escapeHtml(caseManager.id)}">
      <div class="section-heading full">
        <h4>${escapeHtml(caseManager.name)}</h4>
        ${statusPill(`${assignedCount} patient${assignedCount === 1 ? "" : "s"}`, assignedCount ? "blue" : "gold")}
      </div>
      ${input("name", "Name", "text", true, "full", caseManager.name)}
      ${input("email", "Email", "email", false, "", caseManager.email || "")}
      ${input("mobile", "Mobile", "tel", false, "", caseManager.mobile || "")}
      ${companyInput("organisation", "Company / provider", caseManager.organisation || "", "full")}
      ${textarea("notes", "Notes", "full", caseManager.notes || "")}
      <div class="form-actions full">
        <button type="button" data-action="case-manager-profile" data-id="${escapeHtml(caseManager.id)}">Open profile</button>
        <button type="submit" class="secondary">Update</button>
      </div>
    </form>
  `;
}

function renderCaseManagerProfileModal() {
  if (!state.caseManagerProfileId || state.data.currentUser?.role !== "admin") return "";
  const caseManager = (state.data.caseManagers || []).find((item) => item.id === state.caseManagerProfileId);
  if (!caseManager) return "";
  const patients = caseManagerProfilePatients(caseManager.id);

  return `
    <div class="appointment-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="case-manager-profile-title">
      <article class="appointment-modal case-manager-profile-modal">
        <header class="appointment-modal-header">
          <div>
            <h3 id="case-manager-profile-title">${escapeHtml(caseManager.name)}</h3>
            <p>${escapeHtml(caseManager.organisation || "No company selected")}</p>
            <strong>${patients.length} linked patient${patients.length === 1 ? "" : "s"}</strong>
          </div>
          <button type="button" class="appointment-modal-close" data-action="case-manager-profile-close" aria-label="Close case manager profile">&times;</button>
        </header>
        <div class="appointment-modal-body single-column case-manager-profile-body">
          <section class="case-manager-profile-grid">
            <article>
              <strong>Email</strong>
              <span>${escapeHtml(caseManager.email || "Not recorded")}</span>
            </article>
            <article>
              <strong>Mobile</strong>
              <span>${escapeHtml(caseManager.mobile || "Not recorded")}</span>
            </article>
            <article>
              <strong>Company</strong>
              <span>${escapeHtml(caseManager.organisation || "Not recorded")}</span>
            </article>
          </section>
          ${caseManager.notes ? `
            <section class="case-manager-notes">
              <strong>Notes</strong>
              <p>${escapeHtml(caseManager.notes)}</p>
            </section>
          ` : ""}
          <section>
            <div class="section-heading">
              <h4>Linked patients</h4>
              <span>${patients.length} current</span>
            </div>
            <div class="case-manager-patient-list">
              ${patients.map((item) => `
                <article class="case-manager-patient-row">
                  <div>
                    ${patientNameButton(item.client.id, item.client.name || item.referral.clientName || "Client")}
                    <span>${escapeHtml([item.client.phone || item.referral.phone, item.client.fundingType || item.referral.fundingType].filter(Boolean).join(" | ") || "No contact/funding recorded")}</span>
                  </div>
                  <div>
                    ${statusPill(item.referral.status || "current")}
                    <span>${escapeHtml(item.referral.assignedContractorId ? userName(item.referral.assignedContractorId) : "Unassigned")}</span>
                  </div>
                </article>
              `).join("") || emptyState("No patients linked to this case manager yet.")}
            </div>
          </section>
        </div>
      </article>
    </div>
  `;
}

function renderPatientCaseManagerRow(client) {
  const current = caseManagerForClient(client);
  return `
    <article class="card compact patient-case-manager-row">
      <div>
        <strong>${patientNameButton(client.id, client.name || clientName(client.id))}</strong>
        <span>${escapeHtml(client.phone || client.email || client.address || "No contact recorded")}</span>
      </div>
      <label>
        Case manager
        <select data-action="assign-case-manager" data-client-id="${escapeHtml(client.id)}">
          <option value="">No case manager</option>
          ${(state.data.caseManagers || []).map((caseManager) => `
            <option value="${escapeHtml(caseManager.id)}" ${caseManager.id === (client.caseManagerId || "") ? "selected" : ""}>
              ${escapeHtml(caseManagerLabel(caseManager))}
            </option>
          `).join("")}
        </select>
      </label>
      <span>${current ? escapeHtml(caseManagerContactLine(current)) : "Not assigned"}</span>
    </article>
  `;
}

function renderReferralCompanies() {
  const groups = companyReferralGroups();
  const providerGroups = groups.filter((group) => group.company !== "No company selected");
  const totalReferrals = groups.reduce((sum, group) => sum + group.clients.length, 0);
  const totalCaseManagers = groups.reduce((sum, group) => sum + group.managers.length, 0);

  return `
    <section class="section">
      <div class="section-heading">
        <h3>Aged care provider companies</h3>
        <span>${providerGroups.length} companies tracked</span>
      </div>
      <div class="overview-summary company-summary">
        <article><strong>${providerGroups.length}</strong><span>Provider companies</span></article>
        <article><strong>${totalCaseManagers}</strong><span>Case managers saved</span></article>
        <article><strong>${totalReferrals}</strong><span>Current referred patients</span></article>
      </div>
    </section>
    <section class="section">
      <div class="section-heading">
        <h3>Company directory</h3>
        <span>Case managers and referred patients</span>
      </div>
      <div class="company-tracker-grid">
        ${groups.map(renderCompanyReferralCard).join("") || emptyState("No companies found. Add company/provider names to saved case managers first.")}
      </div>
    </section>
  `;
}

function renderCompanyReferralCard(group) {
  const caseManagerCount = group.managers.length;
  const patientCount = group.clients.length;
  const practitionerCount = group.practitionerIds?.size || 0;
  return `
    <article class="card company-group-card">
      <div class="section-heading">
        <h4>${escapeHtml(group.company)}</h4>
        ${statusPill(`${patientCount} patient${patientCount === 1 ? "" : "s"}`, patientCount ? "blue" : "gold")}
      </div>
      <div class="company-metrics">
        <article><strong>${caseManagerCount}</strong><span>Case manager${caseManagerCount === 1 ? "" : "s"}</span></article>
        <article><strong>${patientCount}</strong><span>Current patient${patientCount === 1 ? "" : "s"} referred</span></article>
        <article><strong>${practitionerCount}</strong><span>Practitioner${practitionerCount === 1 ? "" : "s"} involved</span></article>
      </div>
      <div class="company-manager-list">
        ${group.managers.map((manager) => `
          <section class="company-manager-block">
            <div class="company-manager-heading">
              <div>
                <strong>${escapeHtml(manager.name)}</strong>
                <span>${escapeHtml(manager.contact || "No contact details")}</span>
              </div>
              ${statusPill(`${manager.clients.length} referred`, manager.clients.length ? "blue" : "gold")}
            </div>
            <div class="company-client-list">
              ${manager.clients.length ? manager.clients.map((item) => `
                <div class="company-client-row">
                  <div>
                    ${patientNameButton(item.client.id, item.client.name || item.referral.clientName || "Client")}
                    <span>${escapeHtml([item.client.phone || item.referral.phone, item.client.fundingType || item.referral.fundingType].filter(Boolean).join(" | ") || "No contact/funding recorded")}</span>
                  </div>
                  <div>
                    ${statusPill(item.referral.status || "current")}
                    ${item.referral.assignedContractorId ? `<span>${escapeHtml(userName(item.referral.assignedContractorId))}</span>` : ""}
                  </div>
                </div>
              `).join("") : `<p class="company-empty">No current referred patients for this case manager.</p>`}
            </div>
          </section>
        `).join("")}
      </div>
    </article>
  `;
}

function renderAdminReportRow(report) {
  const appointment = appointmentById(report.appointmentId);
  const sent = Boolean(report.caseManagerSentAt);

  return `
    <article class="card admin-report-row ${sent ? "" : "requires-admin-review"}">
      <div class="admin-report-main">
        <div>
          <strong>${escapeHtml(clientName(report.clientId))}</strong>
          <span>${escapeHtml(report.type)}</span>
        </div>
        <div>
          <strong>${escapeHtml(userName(report.contractorId))}</strong>
          <span>${appointment ? `${formatDateTime(appointment.startsAt)} - ${formatTime(appointment.endsAt)}` : formatDateTime(report.updatedAt || report.createdAt)}</span>
        </div>
        <div>
          ${sent ? "" : statusPill("admin review needed", "coral")}
          ${statusPill(sent ? "sent to case manager" : "ready to send", sent ? "" : "blue")}
          ${sent ? `<span class="report-sent-date">${formatDateTime(report.caseManagerSentAt)}</span>` : ""}
        </div>
        <div>
          ${renderClinikoReportUploadStatus(report)}
        </div>
      </div>
      <div class="actions">
        <button type="button" class="${sent ? "" : "secondary"}" data-action="report-case-manager" data-id="${escapeHtml(report.id)}" aria-pressed="${sent ? "true" : "false"}">Sent to case manager</button>
        <button type="button" class="secondary" data-action="open-report" data-id="${escapeHtml(report.id)}">Open report</button>
        <a class="button secondary" href="/api/reports/${escapeHtml(report.id)}/pdf" target="_blank" rel="noreferrer">Download PDF</a>
        ${renderClinikoReportUploadButton(report)}
      </div>
    </article>
  `;
}

function renderAdminReferrals() {
  const referrals = filterItems(state.data.referrals);
  const bookedPatients = bookedNewPatientReferrals(referrals);
  const canCreateReferral = state.data.currentUser?.role === "admin";

  return `
    ${canCreateReferral ? renderReferralCreateForm() : ""}
    <section class="section">
      <div class="section-heading"><h3>New patients booked in</h3><span>${bookedPatients.length} booked</span></div>
      <div class="grid cards-3">
        ${bookedPatients.map(renderBookedNewPatientCard).join("") || emptyState("No new patients have been booked in yet.")}
      </div>
    </section>
    <section class="section">
      <div class="section-heading"><h3>Referrals</h3><span>${referrals.length} synced records</span></div>
      <div class="grid">
        ${referrals.map(renderReferralCard).join("") || emptyState("No referrals found. Synced Cliniko referrals will appear here.")}
      </div>
    </section>
  `;
}

function renderReferralCreateForm() {
  return `
    <section class="section referral-management-section">
      <div class="section-heading"><h3>Add referral</h3><span>Admin</span></div>
      <form class="card form-grid dense-form referral-create-form" id="referral-form">
        ${input("clientName", "Patient name", "text", true)}
        ${input("phone", "Mobile", "tel")}
        ${input("email", "Email", "email")}
        ${input("address", "Address", "text", false, "full")}
        ${input("suburb", "Suburb")}
        ${select("fundingType", "Funding", ["", "Home Care Package", "CHSP", "SAH", "NDIS", "Private", "Other"])}
        ${select("serviceTypeRequired", "Service", ["Physiotherapy"], "Physiotherapy")}
        ${select("urgency", "Urgency", ["Low", "Medium", "High", "Urgent"], "Medium")}
        ${select("assignedContractorId", "Assign practitioner", contractorOptions(true))}
        ${input("referralSource", "Referral source / company")}
        ${select("caseManagerId", "Case manager", caseManagerOptions(true))}
        ${textarea("reasonForReferral", "Reason for referral", "full")}
        ${textarea("risks", "Risk alerts", "full")}
        <div class="form-actions full">
          <button type="submit">Add referral</button>
        </div>
      </form>
    </section>
  `;
}

function renderAdminArchivedAppointments() {
  const archivedAppointments = sortArchivedAppointments(filterArchivedAppointments(state.data.archivedAppointments || []));
  const canDeleteHistory = state.data.currentUser?.role === "admin";

  return `
    <section class="section">
      <div class="section-heading archived-history-heading">
        <div>
          <h3>Archived appointments</h3>
          <span>${archivedAppointments.length} archived</span>
        </div>
        ${canDeleteHistory && archivedAppointments.length ? `
          <button type="button" class="danger" data-action="archived-appointments-clear">Clear all history</button>
        ` : ""}
      </div>
      <div class="overview-list archived-appointment-list">
        ${archivedAppointments.map(renderArchivedAppointmentCard).join("") || emptyState("No archived appointments yet.")}
      </div>
    </section>
  `;
}

function renderArchivedAppointmentCard(appointment) {
  const client = state.data.clients.find((item) => item.id === appointment.clientId) || {};
  const archivedBy = appointment.archivedBy ? userName(appointment.archivedBy) : "Not recorded";
  const createdBy = appointment.createdBy ? userName(appointment.createdBy) : "Not recorded";

  return `
    <article class="card compact archived-appointment-card">
      <div class="section-heading">
        <h4>${patientNameButton(appointment.clientId, client.name || clientName(appointment.clientId))}</h4>
        ${statusPill("archived", "coral")}
      </div>
      <div class="detail-list">
        <div><strong>Appointment</strong>${formatDateTime(appointment.startsAt)} - ${formatTime(appointment.endsAt)}</div>
        <div><strong>Type</strong>${escapeHtml(appointment.appointmentType || appointment.recurrence || appointment.serviceType || "Not recorded")}</div>
        <div><strong>Practitioner</strong>${escapeHtml(userName(appointment.contractorId))}</div>
        <div><strong>Archived by</strong>${escapeHtml(archivedBy)}</div>
        <div><strong>Archived on</strong>${appointment.archivedAt ? formatDateTime(appointment.archivedAt) : "Not recorded"}</div>
        <div><strong>Booked by</strong>${escapeHtml(createdBy)}</div>
        <div><strong>Address</strong>${escapeHtml(appointment.address || client.address || "No address recorded")}</div>
      </div>
      <div class="mini-actions">
        <button type="button" class="secondary" data-action="archived-appointment-open" data-id="${escapeHtml(appointment.id)}">View history</button>
        ${state.data.currentUser?.role === "admin" ? `<button type="button" class="danger" data-action="archived-appointment-delete" data-id="${escapeHtml(appointment.id)}">Delete history</button>` : ""}
      </div>
    </article>
  `;
}

function renderArchivedAppointmentDetailModal() {
  if (!state.adminArchivedAppointmentId) return "";
  const appointment = (state.data.archivedAppointments || []).find((item) => item.id === state.adminArchivedAppointmentId);
  if (!appointment) return "";
  const client = state.data.clients.find((item) => item.id === appointment.clientId) || {};
  const archivedBy = appointment.archivedBy ? userName(appointment.archivedBy) : "Not recorded";
  const createdBy = appointment.createdBy ? userName(appointment.createdBy) : "Not recorded";
  const canDeleteHistory = state.data.currentUser?.role === "admin";

  return `
    <div class="appointment-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="archived-appointment-title">
      <article class="appointment-modal archived-history-modal">
        <header class="appointment-modal-header">
          <div>
            <h3 id="archived-appointment-title">Archived appointment history</h3>
            <p>${escapeHtml(client.name || clientName(appointment.clientId))}</p>
            <strong>${formatDateTime(appointment.startsAt)} - ${formatTime(appointment.endsAt)}</strong>
          </div>
          <button type="button" class="appointment-modal-close" data-action="archived-appointment-close" aria-label="Close archived appointment history">&times;</button>
        </header>
        <div class="appointment-modal-body single-column">
          <div class="detail-list">
            <div><strong>Appointment</strong>${formatDateTime(appointment.startsAt)} - ${formatTime(appointment.endsAt)}</div>
            <div><strong>Type</strong>${escapeHtml(appointment.appointmentType || appointment.recurrence || appointment.serviceType || "Not recorded")}</div>
            <div><strong>Practitioner</strong>${escapeHtml(userName(appointment.contractorId))}</div>
            <div><strong>Archived by</strong>${escapeHtml(archivedBy)}</div>
            <div><strong>Archived on</strong>${appointment.archivedAt ? formatDateTime(appointment.archivedAt) : "Not recorded"}</div>
            <div><strong>Booked by</strong>${escapeHtml(createdBy)}</div>
            <div><strong>Phone</strong>${phoneLink(appointmentContactNumber(appointment), "No mobile recorded")}</div>
            <div><strong>Address</strong>${escapeHtml(appointment.address || client.address || "No address recorded")}</div>
          </div>
          ${canDeleteHistory ? `
            <div class="form-actions">
              <button type="button" class="danger" data-action="archived-appointment-delete" data-id="${escapeHtml(appointment.id)}">Delete this history</button>
              <button type="button" class="secondary" data-action="archived-appointment-close">Close</button>
            </div>
          ` : ""}
        </div>
      </article>
    </div>
  `;
}

function renderSchedule(showAll) {
  const appointments = sortAppointments(filterItems(state.data.appointments));
  const grouped = groupByDay(appointments);
  const scheduleList = `
    <section class="section">
      <div class="section-heading"><h3>${showAll ? "Mobile schedule" : "My schedule"}</h3><span>${appointments.length} bookings</span></div>
      <div class="grid">
        ${Object.entries(grouped).map(([day, items]) => `
          <div class="section">
            <div class="section-heading"><h3>${escapeHtml(day)}</h3><span>${items.length} visits</span></div>
            <div class="grid cards-3">${items.map(renderAppointmentCard).join("")}</div>
          </div>
        `).join("") || emptyState("No bookings found.")}
      </div>
    </section>
  `;

  if (showAll && state.data.currentUser.role === "admin") {
    return `
      <div class="two-col">
        ${renderReceptionBookingForm()}
        ${scheduleList}
      </div>
    `;
  }

  return scheduleList;
}

function renderReceptionBookingForm() {
  return `
    <section class="section">
      <div class="section-heading"><h3>Book new patient</h3><span>Reception</span></div>
      <form class="card form-grid" id="reception-booking-form">
        <input type="hidden" name="actorId" value="${state.data.currentUser.id}">
        ${input("fullName", "Full name", "text", true)}
        ${input("contactNumber", "Contact number", "tel", true)}
        ${input("address", "Address", "text", true, "full")}
        ${select("contractorId", "Practitioner", state.data.contractors.map((contractor) => [contractor.id, `${contractor.name} - ${contractor.discipline}`]))}
        ${select("appointmentType", "Appointment type", receptionAppointmentTypes())}
        ${input("startsAtLocal", "Appointment time", "datetime-local", true)}
        <label>
          Duration
          <input name="durationMinutes" type="number" min="15" step="15" value="60">
        </label>
        ${textarea("reasonForReferral", "Reason for referral", "full")}
        <div class="form-actions full">
          <button type="submit">Book patient</button>
        </div>
      </form>
    </section>
  `;
}

function renderContractorToday() {
  const practitioner = currentCalendarPractitioner();
  if (!practitioner) return emptyState("No practitioner is available yet. Sync or create a practitioner first.");
  const visibleAppointments = sortAppointments(filterItems(appointmentsForPractitioner(state.data.appointments, practitioner.id)));
  const todayAppointments = sortAppointments(appointmentsForDay(visibleAppointments, new Date()));

  return `
    ${renderPractitionerCalendar(visibleAppointments)}
    <section class="section today-appointments-section">
      <div class="section-heading"><h3>Today's appointments</h3><span>${todayAppointments.length} visits</span></div>
      <div class="today-appointments-grid">
        ${todayAppointments.map(renderAppointmentCard).join("") || emptyState("No visits today.")}
      </div>
    </section>
  `;
}

function renderContractorUpdates() {
  const notifications = sortNotifications(filterItems(notificationsForPractitionerWorkspace()));
  const unread = notifications.filter((item) => !item.read).length;
  const sections = groupedUpdateSections(notifications);

  return `
    <section class="section">
      <div class="section-heading"><h3>Updates mailbox</h3><span>${unread} unread</span></div>
      ${notifications.length ? renderUpdatesSummary(sections) : ""}
      <div class="updates-section-list">
        ${sections.map(renderUpdateSection).join("") || emptyState("No updates from admin yet.")}
      </div>
    </section>
  `;
}

function renderContractorMessages() {
  const admin = adminUser();
  const thread = admin ? messagesForThread(admin.id) : [];
  const unreadCount = unreadDirectMessages().length;

  return `
    <section class="section">
      <div class="section-heading"><h3>Messages</h3><span>${unreadCount ? `${unreadCount} unread` : "Admin chat"}</span></div>
      ${renderMessageInboxAlert(unreadCount)}
      ${admin ? `
        <div class="chat-panel chat-panel-full practitioner-chat-panel">
          ${renderChatHeader("Admin messages", "Direct to admin", "Send updates or questions to admin/reception only.")}
          ${renderMessageList(thread)}
          ${renderMessageForm(admin.id, "Send message to admin")}
        </div>
      ` : emptyState("No admin user is available for messaging.")}
    </section>
  `;
}

function renderOwnerPractitionerMessagesPreview() {
  const practitioner = currentCalendarPractitioner();
  const admin = adminUser();
  const thread = practitioner && admin ? messagesBetweenUsers(practitioner.id, admin.id) : [];

  return `
    <section class="section">
      <div class="section-heading"><h3>Messages</h3><span>Practitioner preview</span></div>
      <section class="message-inbox-alert" aria-live="polite">
        <strong>Practitioners can only message admin</strong>
        <span>You are signed in as owner, so this is a preview of ${escapeHtml(practitioner?.name || "the practitioner")}'s admin chat. Use Admin Messages to reply.</span>
      </section>
      <div class="chat-panel chat-panel-full practitioner-chat-panel">
        ${renderChatHeader("Admin messages", "Practitioner preview", `${practitioner?.name || "Practitioner"} can message admin only.`)}
        ${renderMessageList(thread, practitioner?.id)}
        <div class="chat-compose chat-preview-actions">
          <button type="button" data-action="owner-admin-messages">Open admin messages</button>
        </div>
      </div>
    </section>
  `;
}

function renderMessageInboxAlert(unreadCount) {
  if (!unreadCount) return "";
  return `
    <section class="message-inbox-alert" aria-live="polite">
      <strong>${unreadCount} incoming message${unreadCount === 1 ? "" : "s"}</strong>
      <span>Open the highlighted conversation to read and reply.</span>
    </section>
  `;
}

function groupedUpdateSections(notifications) {
  const groups = [
    {
      id: "schedule",
      title: "Schedule changes",
      hint: "Rebookings, new bookings, and timing changes",
      types: ["appointment_rebooked", "new_patient_booked", "rebook_status", "running_late"],
      items: []
    },
    {
      id: "reports",
      title: "Reports and approvals",
      hint: "Report copies, approval updates, and case-manager actions",
      types: ["report_reminder", "approval_result", "report_copy", "case_manager_report_sent", "approval_request"],
      items: []
    },
    {
      id: "messages",
      title: "Admin messages",
      hint: "Direct messages and admin notices",
      types: ["direct_message"],
      items: []
    },
    {
      id: "other",
      title: "Other updates",
      hint: "Referrals and general workflow updates",
      types: [],
      items: []
    }
  ];

  notifications.forEach((item) => {
    const group = groups.find((entry) => entry.types.includes(item.type)) || groups.at(-1);
    group.items.push(item);
  });

  return groups.filter((group) => group.items.length);
}

function renderUpdatesSummary(sections) {
  return `
    <div class="updates-summary-strip" aria-label="Update categories">
      ${sections.map((section) => {
        const unread = section.items.filter((item) => !item.read).length;
        return `
          <article>
            <strong>${section.items.length}</strong>
            <span>${escapeHtml(section.title)}</span>
            ${unread ? `<em>${unread} unread</em>` : `<em>all read</em>`}
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderUpdateSection(section) {
  const unread = section.items.filter((item) => !item.read).length;
  return `
    <section class="updates-group updates-group-${escapeHtml(section.id)}">
      <header class="updates-group-header">
        <div>
          <h4>${escapeHtml(section.title)}</h4>
          <p>${escapeHtml(section.hint)}</p>
        </div>
        <span>${section.items.length} total${unread ? ` · ${unread} unread` : ""}</span>
      </header>
      <div class="mailbox-list updates-group-items">
        ${section.items.map(renderUpdateMailboxCard).join("")}
      </div>
    </section>
  `;
}

function renderUpdateMailboxCard(item) {
  const isUnread = !item.read;
  return `
    <article
      class="card compact update-card mailbox-card ${item.read ? "muted-card is-read" : "is-unread"}"
      ${isUnread ? `role="button" tabindex="0" data-action="notification-read" data-id="${escapeHtml(item.id)}" aria-label="Mark update as read"` : ""}
    >
      <div class="section-heading">
        <h4>${escapeHtml(notificationTypeLabel(item.type))}</h4>
        ${statusPill(item.read ? "read" : "unread", item.read ? "" : "blue")}
      </div>
      <div class="update-card-body">
        <div><strong>Received</strong><span>${formatDateTime(item.createdAt)}</span></div>
        <p>${escapeHtml(item.message || "No message supplied.")}</p>
      </div>
      ${isUnread ? `<div class="mini-actions"><button type="button" class="secondary" data-action="notification-read" data-id="${escapeHtml(item.id)}">Mark as read</button></div>` : ""}
    </article>
  `;
}

function renderMessageList(messages, perspectiveUserId = state.data.currentUser.id) {
  return `
    <div class="chat-messages ${messages.length ? "" : "is-empty"}" aria-label="Message thread">
      ${messages.map((message) => `
        <article class="chat-message ${message.fromUserId === perspectiveUserId ? "from-me" : "from-them"}">
          <div>
            <strong>${escapeHtml(userName(message.fromUserId))}</strong>
            <span>${formatDateTime(message.createdAt)}</span>
          </div>
          <p>${escapeHtml(message.body)}</p>
        </article>
      `).join("") || emptyState("No messages yet.")}
    </div>
  `;
}

function renderChatHeader(title, status, hint = "") {
  return `
    <header class="chat-panel-header">
      <div>
        <h4>${escapeHtml(title)}</h4>
        ${hint ? `<p>${hint}</p>` : ""}
      </div>
      ${status ? `<span>${escapeHtml(status)}</span>` : ""}
    </header>
  `;
}

function renderMessageForm(toUserId, buttonText) {
  return `
    <form class="chat-compose" id="message-form">
      <input type="hidden" name="fromUserId" value="${escapeHtml(state.data.currentUser.id)}">
      <input type="hidden" name="toUserId" value="${escapeHtml(toUserId)}">
      <textarea name="body" placeholder="Type a message..." required></textarea>
      <button type="submit">${escapeHtml(buttonText)}</button>
    </form>
  `;
}

function renderPractitionerCalendar(appointments) {
  const practitioner = currentCalendarPractitioner();
  if (!practitioner) return emptyState("No practitioner is selected.");
  const days = calendarDays(effectiveCalendarMode());
  const slots = calendarSlots(appointments, days, practitioner);
  const visibleAppointments = appointments.filter((appointment) =>
    appointment.status !== "cancelled" && days.some((day) => day.key === brisbaneDateKey(appointment.startsAt))
  );
  const visibleUnavailableBlocks = unavailableBlocksForDays(days);

  return `
    <section class="scheduler-shell">
      ${renderSchedulerToolbar("Calendar")}
      <div class="scheduler-body">
        ${renderSchedulerSidebar()}
        <div class="calendar-scroll scheduler-calendar">
          <div class="calendar-grid" style="--calendar-days: ${days.length}">
            ${renderCalendarHeader(days)}
            ${slots.map((slot) => `
              <div class="${calendarTimeClass(slot, practitioner)}">${formatCalendarTimeAxisLabel(slot)}</div>
              ${days.map((day) => {
                const slotAppointments = visibleAppointments.filter((appointment) =>
                  brisbaneDateKey(appointment.startsAt) === day.key
                  && appointmentSlotMinutes(appointment) === slot
                );
                const slotUnavailableBlocks = visibleUnavailableBlocks.filter((block) =>
                  unavailableBlockDayKey(block) === day.key
                  && unavailableBlockStartSlot(block) === slot
                );
                const unavailableHere = slotHasUnavailableConflict(day.key, slot, 15);
                const startsWithBlockingUnavailable = slotUnavailableBlocks.some(unavailableBlockBlocksBooking);
                const canBookSlot = !startsWithBlockingUnavailable && !unavailableHere;
                return `
                  <div class="${calendarCellClass(slot, practitioner, day.key)} ${day.isToday ? "is-today" : ""}" data-calendar-day="${day.key}" data-calendar-slot="${slot}">
                    ${slotAppointments.length
                      ? slotAppointments.map(renderCalendarEvent).join("")
                      : slotUnavailableBlocks.length
                      ? `${slotUnavailableBlocks.map(renderUnavailableBlock).join("")}${canBookSlot ? renderCalendarEmptySlot(day, slot, practitioner) : ""}`
                      : unavailableHere
                      ? `<span class="calendar-unavailable-fill" aria-hidden="true"></span>`
                      : renderCalendarEmptySlot(day, slot, practitioner)}
                  </div>
                `;
              }).join("")}
            `).join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderUnavailableBlock(block) {
  const readOnly = unavailableBlockIsReadOnly(block);
  const label = block.label || blockKindLabel(block.kind);
  return `
    <button
      type="button"
      class="calendar-unavailable-block ${readOnly ? "is-read-only" : ""}"
      data-block-kind="${escapeHtml(block.kind || "unavailable")}"
      style="--slot-span: ${unavailableBlockSlotSpan(block)}"
      draggable="${readOnly ? "false" : "true"}"
      data-action="${readOnly ? "synced-unavailable-block" : "open-unavailable-block"}"
      data-calendar-item-type="unavailable"
      data-id="${escapeHtml(block.id)}"
      title="${escapeHtml(label)} ${formatSelectedSlot(block.startsAtLocal)}"
    >
      <strong>${escapeHtml(label)}</strong>
      <span>${formatLocalTime(block.startsAtLocal)}-${formatLocalTime(block.endsAtLocal)}</span>
      ${block.note ? `<em>${escapeHtml(block.note)}</em>` : ""}
      ${readOnly ? `<em>Cliniko</em>` : `<span class="calendar-resize-handle" data-resize-type="unavailable" data-resize-id="${escapeHtml(block.id)}" aria-hidden="true"></span>`}
    </button>
  `;
}

function renderCalendarEmptySlot(day, slot, practitioner = currentCalendarPractitioner()) {
  const startLocal = localDateTimeFromDaySlot(day.key, slot);
  if (calendarSlotIsOutsideWorkHours(slot, practitioner, day.key)) {
    return `<span class="calendar-busy" aria-label="Outside Cliniko working hours"></span>`;
  }
  return `
    <button
      type="button"
      class="calendar-empty-slot"
      data-action="calendar-booking"
      data-start-local="${escapeHtml(startLocal)}"
      aria-label="Create appointment at ${formatSlotTime(slot)} on ${escapeHtml(day.heading)}"
    ></button>
  `;
}

function renderClients() {
  const clients = filterItems(clientsForPractitionerWorkspace(state.data.clients));
  return `
    <section class="section">
      <div class="section-heading"><h3>Client records</h3><span>${clients.length} assigned</span></div>
      <div class="client-record-list">
        ${clients.map(renderClientCard).join("") || emptyState("No assigned clients found.")}
      </div>
    </section>
  `;
}

function renderRebook() {
  const data = state.data;
  const practitioner = currentCalendarPractitioner();
  if (!practitioner) return emptyState("No practitioner is available yet. Sync or create a practitioner first.");
  const clients = filterItems(clientsForPractitionerWorkspace(data.clients));
  const rebookWorklist = clients.filter(clientNeedsRebook);
  const selectedRebookClient = data.clients.find((client) => client.id === state.rebookClientId);
  const selectedStatusClient = data.clients.find((client) => client.id === state.rebookStatusClientId);

  if (selectedStatusClient) {
    return `
      <section class="section">
        <div class="section-heading"><h3>Status update</h3><span>Send to reception</span></div>
        <form class="card form-grid" id="rebook-status-form">
          <input type="hidden" name="contractorId" value="${escapeHtml(practitioner.id)}">
          <input type="hidden" name="clientId" value="${selectedStatusClient.id}">
          <div class="full detail-list">
            <div><strong>Patient</strong>${escapeHtml(selectedStatusClient.name)}</div>
            <div><strong>Address</strong>${escapeHtml(selectedStatusClient.address || "")}</div>
          </div>
          ${textarea("reason", "Why they do not need to be rebooked", "full")}
          <div class="form-actions full">
            <button type="submit">Send to reception</button>
            <button type="button" class="secondary" data-action="cancel-rebook">Cancel</button>
          </div>
        </form>
      </section>
    `;
  }

  if (selectedRebookClient) {
    return `
      <section class="section rebook-focus-section">
        <div class="rebook-calendar-stage ${state.rebookSelectedStartLocal ? "has-selected-slot" : ""}">
          ${renderRebookInstructionCard(selectedRebookClient)}
          ${renderRebookSlotCalendar(selectedRebookClient)}
          ${state.rebookSelectedStartLocal ? `
            <div class="rebook-booking-popover" role="dialog" aria-label="Create another appointment">
              ${renderRebookAppointmentForm(data, selectedRebookClient)}
            </div>
          ` : ""}
        </div>
      </section>
    `;
  }

  return `
    <section class="section">
      <div class="section-heading"><h3>Patients without upcoming appointments</h3><span>${rebookWorklist.length} to review</span></div>
      <div class="grid cards-3">
        ${rebookWorklist.map((client) => `
          <article class="card compact">
            <h4>${patientNameButton(client.id, client.name)}</h4>
            <div class="detail-list">
              <div><strong>Address</strong>${escapeHtml(client.address || "No address recorded")}</div>
              <div><strong>Funding</strong>${escapeHtml(client.fundingType || "Not recorded")}</div>
            </div>
            <div class="actions">
              <button data-action="rebook-client" data-client-id="${client.id}">Book another</button>
              <button class="secondary" data-action="rebook-status" data-client-id="${client.id}">Status</button>
            </div>
          </article>
        `).join("") || emptyState("No assigned patients need rebooking right now.")}
      </div>
    </section>
  `;
}

function renderRebookInstructionCard(client) {
  const selectedLabel = state.rebookSelectedStartLocal ? formatSelectedSlot(state.rebookSelectedStartLocal) : "";
  const clients = filterItems(clientsForPractitionerWorkspace(state.data.clients));
  const rebookClients = [...new Map([
    client,
    ...clients.filter(clientNeedsRebook)
  ].filter(Boolean).map((item) => [item.id, item])).values()];
  return `
    <div class="rebook-instruction-card">
      <div>
        <strong>Book another for ${escapeHtml(client.name)}</strong>
        <span>${selectedLabel ? `Selected ${escapeHtml(selectedLabel)}. Check details, then create the appointment.` : "Tap a blank time on the calendar. The new appointment will default to 1 hour."}</span>
      </div>
      ${rebookClients.length > 1 ? `
        <label class="rebook-patient-picker">
          Patient
          <select id="rebook-client-select">
            ${rebookClients.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === client.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
          </select>
        </label>
      ` : ""}
      <button type="button" class="secondary" data-action="cancel-rebook">Cancel</button>
    </div>
  `;
}

function renderRebookAppointmentForm(data, selectedRebookClient) {
  const practitioner = currentCalendarPractitioner();
  if (!practitioner) return emptyState("No practitioner is selected.");
  const startLocal = defaultRebookStart(selectedRebookClient.id);
  const durationMinutes = defaultRebookDurationMinutes();
  const endLocal = addMinutesToLocalDateTime(startLocal, durationMinutes);
  const startTime = timeSelectParts(startLocal);
  const endTime = timeSelectParts(endLocal);
  const isPast = localDateTimeIsPast(startLocal);
  const syncWarning = calendarBookingSyncWarning(practitioner);

  return `
    <form class="new-appointment-panel rebook-appointment-panel" id="rebook-form">
      <header class="new-appointment-header">
        <h3>New appointment</h3>
        <p>${escapeHtml(formatSelectedSlot(startLocal))}</p>
      </header>
      <div class="new-appointment-fields">
        <input type="hidden" name="actorId" value="${escapeHtml(data.currentUser.id)}">
        <input type="hidden" name="contractorId" value="${escapeHtml(practitioner.id)}">
        <input type="hidden" name="clientId" value="${escapeHtml(selectedRebookClient.id)}">
        <input type="hidden" name="address" value="${escapeHtml(selectedRebookClient.address || "")}">
        <input type="hidden" name="rebookedFromAppointmentId" value="${escapeHtml(state.rebookFromAppointmentId)}">
        <input type="hidden" name="durationMinutes" value="${durationMinutes}">

        <div class="new-appointment-row">
          <span>Practitioner</span>
          <div class="new-appointment-control static-control">${escapeHtml(practitioner.name)}</div>
        </div>

        <div class="new-appointment-row">
          <span>Type</span>
          <select name="appointmentType">
            ${bookingTypeOptions(practitioner.discipline).map((type, index) => `<option value="${escapeHtml(type)}" ${index === 0 ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}
          </select>
        </div>

        <div class="new-appointment-row">
          <span>Patient</span>
          <div class="patient-chip">${escapeHtml(selectedRebookClient.name)} <button type="button" data-action="cancel-rebook" aria-label="Change patient">x</button></div>
        </div>

        <div class="new-appointment-row">
          <span></span>
          <div class="address-box">
            ${clientAddressLines(selectedRebookClient).map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
          </div>
        </div>

        <div class="new-appointment-row">
          <span>Date</span>
          <input name="bookingDate" type="date" value="${escapeHtml(startLocal.split("T")[0])}" required>
        </div>

        <div class="new-appointment-row">
          <span>Time</span>
          <div class="time-selects">
            <div class="time-select-group">
              ${timePartSelect("startHour", hourOptions(), startTime.hour)}
              ${timePartSelect("startMinute", minuteOptions(), startTime.minute)}
              ${timePartSelect("startPeriod", ["AM", "PM"], startTime.period)}
            </div>
            <span class="time-select-separator">to</span>
            <div class="time-select-group">
              ${timePartSelect("endHour", hourOptions(), endTime.hour)}
              ${timePartSelect("endMinute", minuteOptions(), endTime.minute)}
              ${timePartSelect("endPeriod", ["AM", "PM"], endTime.period)}
            </div>
          </div>
        </div>

        ${isPast ? `
          <div class="new-appointment-row">
            <span></span>
            <div class="time-warning">The selected appointment time is in the past.</div>
          </div>
        ` : ""}

        <div class="new-appointment-row">
          <span>Repeat</span>
          ${renderRecurrenceOptions()}
        </div>

        <div class="new-appointment-row">
          <span>Note</span>
          <textarea name="rebookReason"></textarea>
        </div>

        <div class="new-appointment-row">
          <span></span>
          <button type="button" class="text-link" data-action="add-wait-list">Add to wait list</button>
        </div>

        <div class="new-appointment-row new-appointment-actions">
          <span></span>
          <div>
            <button type="submit">Create appointment</button>
            <button type="button" class="secondary" data-action="change-rebook-slot">Choose another time</button>
            <button type="button" class="secondary" data-action="cancel-rebook">Cancel</button>
          </div>
        </div>
      </div>
    </form>
  `;
}

function renderRebookSlotCalendar(client) {
  const appointments = sortAppointments(appointmentsForPractitioner(state.data.appointments));
  const practitioner = currentCalendarPractitioner();
  const days = calendarDays(effectiveCalendarMode());
  const slots = calendarSlots(appointments, days, practitioner);
  const visibleAppointments = appointments.filter((appointment) =>
    appointment.status !== "cancelled" && days.some((day) => day.key === brisbaneDateKey(appointment.startsAt))
  );

  return `
    <section class="scheduler-shell rebook-slot-section">
      ${renderSchedulerToolbar("Choose a gap", true)}
      <div class="scheduler-body compact">
        ${renderSchedulerSidebar()}
        <div class="calendar-scroll scheduler-calendar">
          <div class="calendar-grid" style="--calendar-days: ${days.length}">
            ${renderCalendarHeader(days)}
            ${slots.map((slot) => `
              <div class="${calendarTimeClass(slot, practitioner)}">${formatCalendarTimeAxisLabel(slot)}</div>
              ${days.map((day) => renderRebookSlotCell(day, slot, visibleAppointments, client, practitioner)).join("")}
            `).join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderRebookSlotCell(day, slot, appointments, client, practitioner = currentCalendarPractitioner()) {
  const cellClass = `${calendarCellClass(slot, practitioner, day.key)} ${day.isToday ? "is-today" : ""}`;
  const slotAppointments = appointments.filter((appointment) =>
    brisbaneDateKey(appointment.startsAt) === day.key
    && appointmentSlotMinutes(appointment) === slot
  );
  const busy = slotHasConflict(day.key, slot, 60, appointments) || slotHasUnavailableConflict(day.key, slot, 60);
  const slotUnavailableBlocks = unavailableBlocksForDays([day]).filter((block) =>
    unavailableBlockDayKey(block) === day.key
    && unavailableBlockStartSlot(block) === slot
  );
  const startsWithBlockingUnavailable = slotUnavailableBlocks.some(unavailableBlockBlocksBooking);

  if (slotAppointments.length) {
    return `<div class="${cellClass}" data-calendar-day="${day.key}" data-calendar-slot="${slot}">${slotAppointments.map(renderCalendarEvent).join("")}</div>`;
  }

  if (slotUnavailableBlocks.length && startsWithBlockingUnavailable) {
    return `<div class="${cellClass}" data-calendar-day="${day.key}" data-calendar-slot="${slot}">${slotUnavailableBlocks.map(renderUnavailableBlock).join("")}</div>`;
  }

  if (slotHasUnavailableConflict(day.key, slot, 15)) {
    return `<div class="${cellClass}" data-calendar-day="${day.key}" data-calendar-slot="${slot}"><span class="calendar-unavailable-fill" aria-hidden="true"></span></div>`;
  }

  if (calendarSlotIsOutsideWorkHours(slot, practitioner, day.key)) {
    return `<div class="${cellClass}" data-calendar-day="${day.key}" data-calendar-slot="${slot}"><span class="calendar-busy" aria-label="Outside Cliniko working hours"></span></div>`;
  }

  if (slotIsPast(day.key, slot)) {
    return `<div class="${cellClass}" data-calendar-day="${day.key}" data-calendar-slot="${slot}"><span class="calendar-busy" aria-label="Past time"></span></div>`;
  }

  if (busy) {
    return `<div class="${cellClass}" data-calendar-day="${day.key}" data-calendar-slot="${slot}"><span class="calendar-busy" aria-label="Busy time"></span></div>`;
  }

  const startLocal = localDateTimeFromDaySlot(day.key, slot);
  return `
    <div class="${cellClass}" data-calendar-day="${day.key}" data-calendar-slot="${slot}">
      ${slotUnavailableBlocks.map(renderUnavailableBlock).join("")}
      <button
        type="button"
        class="calendar-gap"
        data-action="select-rebook-slot"
        data-start-local="${escapeHtml(startLocal)}"
        aria-label="Book ${escapeHtml(client.name)} at ${formatSlotTime(slot)} on ${escapeHtml(day.label)}"
      >
      </button>
    </div>
  `;
}

function renderSchedulerToolbar(title, buttonType = false) {
  const typeAttr = buttonType ? ' type="button"' : "";
  const selectedDate = selectedCalendarDateKey();
  const mode = effectiveCalendarMode();
  const rangeLabel = calendarRangeLabel(mode);
  return `
    <div class="scheduler-toolbar">
      <select class="scheduler-location" aria-label="Calendar location">
        <option>Refine Physiotherapy - Mobile</option>
      </select>
      <strong>${escapeHtml(title)}</strong>
      <div class="calendar-date-nav" aria-label="Calendar date">
        <button${typeAttr} class="secondary" data-action="calendar-shift" data-direction="-1" aria-label="Previous ${mode === "week" ? "week" : "day"}">&lt;</button>
        <input type="date" value="${escapeHtml(selectedDate)}" data-action="calendar-date-input" aria-label="Choose calendar date">
        <button type="button" class="calendar-range-label" data-action="calendar-picker-toggle" aria-expanded="${state.calendarMonthPickerOpen ? "true" : "false"}" aria-controls="mobile-calendar-picker">${escapeHtml(rangeLabel)}</button>
        <button${typeAttr} class="secondary" data-action="calendar-shift" data-direction="1" aria-label="Next ${mode === "week" ? "week" : "day"}">&gt;</button>
        <button${typeAttr} class="today-jump" data-action="calendar-today" aria-label="Jump to today's date">Today</button>
      </div>
      ${state.calendarMonthPickerOpen ? renderMobileCalendarMonthPicker() : ""}
      <div class="calendar-toggle" aria-label="Calendar view">
        <button${typeAttr} class="${mode === "day" ? "active" : ""}" data-action="calendar-mode" data-mode="day">Daily</button>
        <button${typeAttr} class="${mode === "week" ? "active" : ""}" data-action="calendar-mode" data-mode="week">Weekly</button>
      </div>
    </div>
  `;
}

function renderSchedulerSidebar() {
  const practitioner = currentCalendarPractitioner() || state.data.currentUser;
  return `
    <aside class="scheduler-sidebar">
      ${renderMiniMonth(0)}
      ${renderMiniMonth(1)}
      <div class="scheduler-panel">
        <div class="panel-row">
          <span>Wait list</span>
          <strong>0</strong>
        </div>
      </div>
      <div class="scheduler-panel">
        <div class="panel-title">Skip ahead</div>
        <div class="skip-buttons">
          <button type="button" data-action="calendar-skip" data-amount="2" data-unit="weeks">2</button>
          <button type="button" data-action="calendar-skip" data-amount="4" data-unit="weeks">4</button>
          <button type="button" data-action="calendar-skip" data-amount="6" data-unit="weeks">6</button>
          <span>weeks</span>
          <button type="button" data-action="calendar-skip" data-amount="3" data-unit="months">3</button>
          <button type="button" data-action="calendar-skip" data-amount="6" data-unit="months">6</button>
          <button type="button" data-action="calendar-skip" data-amount="12" data-unit="months">12</button>
          <span>months</span>
        </div>
      </div>
      <div class="scheduler-panel">
        <div class="panel-title">Practitioners</div>
        ${canUseOwnerWorkspace()
          ? state.data.contractors.map((contractor) => `
            <label class="practitioner-check">
              <input type="radio" name="ownerPractitionerSidebar" data-action="owner-practitioner" value="${escapeHtml(contractor.id)}" ${contractor.id === practitioner.id ? "checked" : ""}>
              ${escapeHtml(contractor.name)}
            </label>
          `).join("")
          : `<div class="practitioner-check current-only">${escapeHtml(practitioner.name)}</div>`}
      </div>
      ${renderAppointmentColourLegend()}
      <div class="scheduler-panel">
        <div class="panel-title">Availability</div>
        <button type="button" class="sidebar-button" data-action="one-off-availability">One-off availability</button>
        <button type="button" class="sidebar-button" data-action="new-unavailable-block">Unavailable block</button>
        <button type="button" class="sidebar-button" data-action="new-travel-block">Travel block</button>
      </div>
    </aside>
  `;
}

function renderAppointmentColourLegend() {
  return `
    <div class="scheduler-panel appointment-colour-legend">
      <div class="panel-title">Appointment colours</div>
      <div class="legend-row"><span class="legend-swatch is-type-initial-sah"></span><span>Initial Physio SAH</span></div>
      <div class="legend-row"><span class="legend-swatch is-type-subsequent-sah"></span><span>Subsequent Physio SAH</span></div>
      <div class="legend-row"><span class="legend-swatch is-type-initial-chsp"></span><span>Initial Physio CHSP</span></div>
      <div class="legend-row"><span class="legend-swatch is-type-subsequent-chsp"></span><span>Subsequent Physio CHSP</span></div>
      <div class="legend-row"><span class="legend-swatch is-type-equipment-trial"></span><span>Equipment Trial</span></div>
    </div>
  `;
}

function renderCalendarHeader(days) {
  const practitioner = currentCalendarPractitioner() || state.data.currentUser;
  return `
    <div class="calendar-corner"></div>
    ${days.map((day) => `
      <div class="calendar-day-head ${day.isToday ? "today" : ""}">
        <strong>${escapeHtml(day.heading)}${day.isToday ? `<em>Today</em>` : ""}</strong>
        <span>${escapeHtml(practitioner.name)}</span>
      </div>
    `).join("")}
  `;
}

function renderMiniMonth(offset, options = {}) {
  const today = brisbaneParts(new Date());
  const selectedParts = datePartsFromKey(selectedCalendarDateKey());
  const monthDate = new Date(Date.UTC(selectedParts.year, selectedParts.month - 1 + state.calendarMonthOffset + offset, 1));
  const month = monthDate.getUTCMonth();
  const year = monthDate.getUTCFullYear();
  const firstDay = new Date(Date.UTC(year, month, 1));
  const startOffset = (firstDay.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const todayKey = dateKeyFromParts(today);
  const selectedKeys = new Set(calendarDays(effectiveCalendarMode()).map((day) => day.key));
  const cells = [];

  for (let i = 0; i < startOffset; i += 1) cells.push("");
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(String(day));

  return `
    <div class="mini-month">
      <div class="mini-month-title">
        ${offset === 0 || options.showBothControls
          ? `<button type="button" data-action="calendar-month-shift" data-direction="-1" aria-label="Previous month">&lsaquo;</button>`
          : `<span class="mini-month-spacer" aria-hidden="true"></span>`}
        <span class="mini-month-label">${new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }).format(monthDate)}</span>
        ${offset === 1 || options.showBothControls
          ? `<button type="button" data-action="calendar-month-shift" data-direction="1" aria-label="Next month">&rsaquo;</button>`
          : `<span class="mini-month-spacer" aria-hidden="true"></span>`}
      </div>
      <div class="mini-weekdays">${["M", "T", "W", "T", "F", "S", "S"].map((label) => `<span>${label}</span>`).join("")}</div>
      <div class="mini-days">
        ${cells.map((day) => {
          if (!day) return "<span></span>";
          const key = day ? dateKeyFromParts({ year, month: month + 1, day: Number(day) }) : "";
          const className = [
            key === todayKey ? "today" : "",
            selectedKeys.has(key) ? "selected" : ""
          ].filter(Boolean).join(" ");
          return `<button type="button" class="${className}" data-action="calendar-date" data-date="${escapeHtml(key)}" aria-pressed="${selectedKeys.has(key) ? "true" : "false"}">${escapeHtml(day)}</button>`;
        }).join("")}
      </div>
    </div>
  `;
}

function renderMobileCalendarMonthPicker() {
  return `
    <div class="mobile-calendar-picker" id="mobile-calendar-picker" aria-label="Choose a calendar date">
      ${renderMiniMonth(0, { showBothControls: true })}
      <div class="mobile-calendar-picker-actions">
        <button type="button" class="secondary" data-action="calendar-picker-close">Close</button>
      </div>
    </div>
  `;
}

function renderNotes() {
  const data = state.data;
  const appointments = sortAppointmentsNewest(data.appointments.filter((appointment) => appointment.status !== "cancelled"));
  const noteAppointments = appointments.filter(noteAppointmentIsRelevant);
  const activeAppointment = noteAppointments.find((appointment) => appointment.id === state.activeAppointmentId)
    || preferredNoteAppointment(noteAppointments);
  if (!activeAppointment) {
    return `
      <section class="section">
        <div class="section-heading"><h3>Treatment notes</h3><span>0 notes</span></div>
        ${emptyState("No appointment available for notes.")}
      </section>
    `;
  }

  const client = data.clients.find((item) => item.id === activeAppointment.clientId) || {};
  const clientAppointments = sortAppointmentsNewest(noteAppointments.filter((appointment) => appointment.clientId === activeAppointment.clientId));
  const timelineAppointments = activeNoteTimelineAppointments(clientAppointments, activeAppointment);
  const completedCount = clientAppointments.filter((appointment) => noteForAppointment(appointment.id)?.status === "signed").length;
  const search = state.noteSearch.trim().toLowerCase();

  return `
    <section class="notes-record notes-list-only">
      <div class="notes-record-header">
        <div>
          <h2>Treatment notes</h2>
          <p>${patientNameButton(activeAppointment.clientId, client.name || clientName(activeAppointment.clientId))}</p>
        </div>
        <div class="notes-record-summary">
          ${statusPill(`${completedCount} completed`, "blue")}
          ${statusPill(`${clientAppointments.length} notes`)}
        </div>
      </div>
      <div class="notes-record-layout">
        <section class="notes-record-main">
          <div class="notes-filter-row">
            <span>Search</span>
            <input id="note-search" type="search" value="${escapeHtml(state.noteSearch)}" aria-label="Filter treatment notes" placeholder="Filter treatment notes by any word or phrase...">
          </div>
          <div class="notes-timeline">
            ${timelineAppointments.map((appointment, index) => renderTreatmentNoteTimelineCard(appointment, activeAppointment, index + 1, search)).join("")}
          </div>
        </section>
      </div>
    </section>
  `;
}

function activeNoteTimelineAppointments(clientAppointments, activeAppointment) {
  const active = clientAppointments.find((appointment) => appointment.id === activeAppointment.id) || activeAppointment;
  const appointmentsWithNotes = clientAppointments.filter((appointment) =>
    appointment.id !== active.id && Boolean(noteForAppointment(appointment.id))
  );
  return [active, ...appointmentsWithNotes];
}

function renderTreatmentNoteTimelineCard(appointment, activeAppointment, index, search) {
  const note = noteForAppointment(appointment.id);
  const isActive = appointment.id === activeAppointment.id;
  const haystack = treatmentNoteSearchText(appointment, note);
  const hidden = search && !haystack.includes(search) && !isActive ? " hidden" : "";
  const offlineDraft = getOfflineDraft(appointment.id);

  if (isActive && (!note || note.status !== "signed" || offlineDraft)) {
    return renderTreatmentNoteFormCard(appointment, note, offlineDraft, index, haystack, hidden);
  }

  return renderTreatmentNoteReadOnlyCard(
    appointment,
    note,
    index,
    isActive,
    state.expandedSignedNoteAppointmentId === appointment.id,
    haystack,
    hidden
  );
}

function renderTreatmentNoteFormCard(appointment, existingNote, offlineDraft, index, haystack, hidden) {
  const discipline = appointment.serviceType || state.data.currentUser.discipline || "Physiotherapy";
  const template = state.data.noteTemplates[discipline] || state.data.noteTemplates["Physiotherapy"];
  const fields = offlineDraft?.fields || existingNote?.fields || {};
  const isInitialPhysio = isInitialPhysioAssessment(appointment);

  return `
    <form class="treatment-note-card note-form is-draft" id="note-form" data-note-search="${escapeHtml(haystack)}" data-active-note="true" data-start-ms="${new Date(appointment.startsAt).getTime()}"${hidden}>
      <input type="hidden" name="id" value="${existingNote?.id || ""}">
      <input type="hidden" name="appointmentId" value="${appointment.id}">
      <input type="hidden" name="clientId" value="${appointment.clientId}">
      <input type="hidden" name="contractorId" value="${appointment.contractorId}">
      <input type="hidden" name="discipline" value="${escapeHtml(discipline)}">
      ${renderTreatmentNoteHeader(appointment, existingNote, index, offlineDraft ? "Offline draft" : "Draft")}
      <div class="treatment-note-body form-grid">
        ${offlineDraft ? `<div class="note-inline-alert full">Offline draft saved on this device</div>` : ""}
        ${renderPreviousTreatmentNoteCopyControl(appointment)}
        ${isInitialPhysio
          ? renderInitialPhysioAssessmentFields(appointment, fields)
          : template.map((field) => textarea(`field_${field}`, labelFromKey(field), "note-field", fields[field] || "")).join("")}
        ${input("signature", "Digital signature", "text", false, "", existingNote?.signature || state.data.currentUser.name)}
        <div class="form-actions full">
          <button type="submit" name="mode" value="draft" class="secondary">Save draft</button>
          <button type="submit" name="mode" value="signed">Sign note</button>
          <button type="submit" name="mode" value="offline" class="warning">Save offline</button>
        </div>
      </div>
    </form>
  `;
}

function renderPreviousTreatmentNoteCopyControl(appointment) {
  const previousNotes = previousTreatmentNotesForAppointment(appointment);
  const previous = previousNotes[0] || null;
  const noteDate = previous?.appointment?.startsAt || previous?.note?.updatedAt || previous?.note?.createdAt || "";

  return `
    <section class="note-copy-control is-single full">
      <input type="hidden" data-previous-note-select value="${escapeHtml(previous?.note?.id || "")}">
      <div>
        <strong>Copy last appointment notes</strong>
        <span>${previous
          ? `${escapeHtml(formatDateTime(noteDate))} - ${escapeHtml(treatmentNoteTitle(previous.appointment || appointment))}`
          : "No previous completed notes for this patient yet."}</span>
      </div>
      <button type="button" class="secondary" data-action="copy-previous-note" ${previous ? "" : "disabled"}>Copy last appointment notes</button>
    </section>
  `;
}

function renderTreatmentNoteReadOnlyCard(appointment, note, index, isActive, expanded, haystack, hidden) {
  const status = note?.status === "signed" ? "Completed" : note?.status === "draft" ? "Draft" : "Not started";
  const statusClass = note?.status === "signed" ? "is-signed" : note?.status === "draft" ? "is-draft" : "is-empty";
  const createdAt = note?.createdAt || appointment.startsAt;

  return `
    <article class="treatment-note-card ${statusClass} ${isActive ? "active" : ""}" data-note-search="${escapeHtml(haystack)}" data-active-note="${isActive ? "true" : "false"}" data-start-ms="${new Date(appointment.startsAt).getTime()}"${hidden}>
      ${renderTreatmentNoteHeader(appointment, note, index, status)}
      ${expanded && note ? renderTreatmentNoteReadOnlyFields(appointment, note) : renderTreatmentNoteCompactSummary(appointment, note)}
      <footer class="treatment-note-footer">
        <div class="note-card-links">
          ${note?.status === "signed"
            ? `<button type="button" class="text-link" data-action="${expanded ? "open-note" : "expand-signed-note"}" data-id="${escapeHtml(appointment.id)}">${expanded ? "Hide note" : "View note"}</button>`
            : `<button type="button" class="text-link" data-action="open-note" data-id="${escapeHtml(appointment.id)}">Open note</button>`}
          ${note ? `<button type="button" class="text-link" data-action="print-note">Export PDF</button>` : ""}
        </div>
        <div class="note-card-links">
          ${noteClinikoUploadBadge(note)}
          <span>Created ${formatDateTime(createdAt)}</span>
        </div>
      </footer>
    </article>
  `;
}

function renderNotesQuickPanel(appointments, activeAppointment) {
  const incomplete = appointments.filter((appointment) => noteForAppointment(appointment.id)?.status !== "signed");
  const nextIncomplete = incomplete.find((appointment) => appointment.id !== activeAppointment.id) || incomplete[0] || null;
  return `
    <section class="notes-quick-panel">
      <label>
        Write note for
        <select id="note-appointment-select">
          ${appointments.map((appointment) => {
            const note = noteForAppointment(appointment.id);
            const status = note?.status === "signed" ? "completed" : note?.status === "draft" ? "draft" : "not started";
            return `<option value="${escapeHtml(appointment.id)}" ${appointment.id === activeAppointment.id ? "selected" : ""}>${escapeHtml(clientName(appointment.clientId))} - ${formatDateTime(appointment.startsAt)} - ${escapeHtml(status)}</option>`;
          }).join("")}
        </select>
      </label>
      <div class="notes-quick-actions">
        ${nextIncomplete && nextIncomplete.id !== activeAppointment.id
          ? `<button type="button" class="secondary" data-action="open-note" data-id="${escapeHtml(nextIncomplete.id)}">Next due note</button>`
          : ""}
        <button type="button" class="secondary" data-action="go-to-calendar-appointment" data-id="${escapeHtml(activeAppointment.id)}" data-starts-at="${escapeHtml(activeAppointment.startsAt)}">Calendar</button>
      </div>
    </section>
  `;
}

function noteClinikoUploadBadge(note) {
  if (!note || note.status !== "signed") return "";
  if (note.clinikoUploadStatus === "synced") return statusPill("Cliniko file synced", "blue");
  if (note.clinikoUploadStatus === "failed") return statusPill("Cliniko file failed", "gold");
  if (note.clinikoUploadStatus === "pending") return statusPill("Cliniko file pending", "gold");
  if (state.data?.clinikoConfig?.noteUploadEnabled) return statusPill("Cliniko file ready", "gold");
  return "";
}

function renderTreatmentNoteHeader(appointment, note, index, status) {
  const typeInfo = appointmentTypeColour(appointment);

  return `
    <header class="treatment-note-header">
      <div>
        <h3>${formatDateTime(appointment.startsAt)}</h3>
        <div class="treatment-note-meta">
          <span>${patientNameButton(appointment.clientId, clientName(appointment.clientId))}</span>
          <span>${escapeHtml(userName(appointment.contractorId))}</span>
          <span>${escapeHtml(typeInfo?.label || appointment.appointmentType || appointment.recurrence || appointment.serviceType || "Appointment")}</span>
        </div>
      </div>
      ${statusPill(status, note?.status === "signed" ? "blue" : "gold")}
    </header>
  `;
}

function renderTreatmentNoteCompactSummary(appointment, note) {
  if (!note) {
    return `
      <div class="note-compact-summary">
        <strong>No note started</strong>
        <span>${formatDateTime(appointment.startsAt)} is ready for treatment notes.</span>
      </div>
    `;
  }

  return `
    <div class="note-compact-summary">
      <strong>${note.status === "signed" ? "Notes completed" : "Draft saved"}</strong>
      <span>${escapeHtml(noteSummary(note))}</span>
    </div>
  `;
}

function renderTreatmentNoteReadOnlyFields(appointment, note) {
  const fields = note.fields || {};
  const keys = displayFieldKeysForNote(appointment, note);
  const rows = keys
    .filter((key) => String(fields[key] || "").trim())
    .map((key) => `
      <section class="note-readonly-field">
        <h4>${escapeHtml(labelFromKey(key))}</h4>
        <p>${escapeHtml(fields[key])}</p>
      </section>
    `);

  return `<div class="note-readonly-fields">${rows.join("") || emptyState("No note details entered.")}</div>`;
}

function displayFieldKeysForNote(appointment, note) {
  const fields = note?.fields || {};
  const baseKeys = isInitialPhysioAssessment(appointment)
    ? [
      "reasonForReferral",
      "medicalHistory",
      "currentHomeSetUp",
      "subjective",
      "objectiveObservations",
      "assessment",
      "treatment",
      "recommendations",
      "plan"
    ]
    : (state.data.noteTemplates[note?.discipline || appointment.serviceType] || state.data.noteTemplates["Physiotherapy"] || []);
  return [
    ...baseKeys,
    ...Object.keys(fields).filter((key) => !baseKeys.includes(key) && !key.startsWith("outcome_"))
  ];
}

function treatmentNoteTitle(appointment) {
  if (isInitialPhysioAssessment(appointment)) return "Initial Physiotherapy Assessment";
  if (isEquipmentTrialReportAppointment(appointment)) return "Equipment Trial";
  if (isSubsequentPhysioTreatmentNoteAppointment(appointment)) return "Subsequent Consultation";
  return "Treatment Note";
}

function treatmentNoteSearchText(appointment, note) {
  return [
    clientName(appointment.clientId),
    userName(appointment.contractorId),
    appointment.appointmentType,
    appointment.recurrence,
    appointment.serviceType,
    appointment.status,
    formatDateTime(appointment.startsAt),
    ...Object.values(note?.fields || {})
  ].join(" ").toLowerCase();
}

function messagesForClient(clientId) {
  const clientNameText = clientName(clientId).toLowerCase();
  return (state.data.messages || []).filter((message) =>
    String(message.body || "").toLowerCase().includes(clientNameText)
  );
}

function renderNoteContext(appointment, note) {
  const client = state.data.clients.find((item) => item.id === appointment.clientId) || {};
  const status = note?.status === "signed" ? "completed" : note?.status || "not started";
  return `
    <section class="note-context full">
      <div>
        <strong>${patientNameButton(appointment.clientId, client.name || clientName(appointment.clientId))}</strong>
        <span>${escapeHtml(appointment.appointmentType || appointment.recurrence || appointment.serviceType || "Appointment")}</span>
      </div>
      <div>
        <strong>${formatDateTime(appointment.startsAt)} - ${formatTime(appointment.endsAt)}</strong>
        <span>${escapeHtml(appointment.address || client.address || "No address recorded")}</span>
      </div>
      <div class="note-context-status">
        ${statusPill(status, note?.status === "signed" ? "" : "gold")}
      </div>
    </section>
  `;
}

function renderNoteStatusRow(appointment, activeAppointmentId = state.activeAppointmentId) {
  const note = noteForAppointment(appointment.id);
  const isActive = appointment.id === activeAppointmentId;

  return `
    <article class="note-status-row ${isActive ? "active" : ""}">
      <div class="note-status-main">
        <strong>${escapeHtml(clientName(appointment.clientId))}</strong>
        <span>${formatDateTime(appointment.startsAt)}</span>
      </div>
      <div class="note-status-pills">
        ${statusPill(note?.status === "signed" ? "completed" : note?.status || "not started", note?.status === "signed" ? "" : "gold")}
        ${statusPill(appointmentStatusLabel(appointment.status), appointmentStatusTone(appointment.status))}
      </div>
      <button class="secondary" data-action="open-note" data-id="${appointment.id}">${note?.status === "signed" ? "View" : "Open"}</button>
    </article>
  `;
}

function noteAppointmentIsRelevant(appointment) {
  return appointmentRequiresTreatmentNote(appointment) || Boolean(noteForAppointment(appointment.id));
}

function preferredNoteAppointment(appointments) {
  return appointments.find((appointment) => noteForAppointment(appointment.id)?.status !== "signed")
    || appointments[0]
    || null;
}

function completedNoteAppointments(appointments) {
  return sortAppointmentsNewest(appointments.filter((appointment) => noteForAppointment(appointment.id)?.status === "signed"));
}

function nextIncompleteNoteAppointmentId(currentAppointmentId) {
  const appointments = sortAppointmentsNewest((state.data.appointments || [])
    .filter((appointment) => appointment.status !== "cancelled" && noteAppointmentIsRelevant(appointment)));
  return appointments.find((appointment) =>
    appointment.id !== currentAppointmentId && noteForAppointment(appointment.id)?.status !== "signed"
  )?.id || currentAppointmentId;
}

function renderNoteAppointmentPicker(appointments, activeAppointment) {
  return `
    <label class="full">
      Appointment
      <select id="note-appointment-select">
        ${appointments.map((appointment) => `<option value="${appointment.id}" ${appointment.id === activeAppointment.id ? "selected" : ""}>${escapeHtml(clientName(appointment.clientId))} - ${formatDateTime(appointment.startsAt)}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderCompletedNoteSummary(appointment, note, appointments) {
  const completedAppointments = completedNoteAppointments(appointments);

  return `
    <article class="card completed-note-summary">
      ${renderNoteAppointmentPicker(appointments, appointment)}
      <div class="completed-note-list full" aria-label="Completed notes">
        ${completedAppointments.map((item) => `
          <div class="completed-note-row ${item.id === appointment.id ? "active" : ""}">
            <strong>${formatDateTime(item.startsAt)}</strong>
            <span>Notes completed</span>
            <button type="button" class="secondary" data-action="expand-signed-note" data-id="${escapeHtml(item.id)}">View note</button>
          </div>
        `).join("") || `
          <div class="completed-note-row active">
            <strong>${formatDateTime(appointment.startsAt)}</strong>
            <span>Notes completed</span>
            <button type="button" class="secondary" data-action="expand-signed-note" data-id="${escapeHtml(appointment.id)}">View note</button>
          </div>
        `}
      </div>
    </article>
  `;
}

function renderInitialPhysioAssessmentFields(appointment, fields) {
  const client = state.data.clients.find((item) => item.id === appointment.clientId) || {};
  const selectedMeasures = selectedOutcomeMeasuresForAppointment(appointment.id, fields);
  const customMeasures = customOutcomeMeasuresFromFields(fields);
  const allMeasures = outcomeMeasureRows(selectedMeasures, customMeasures);

  return `
    <div class="pill blue full">Initial physiotherapy assessment</div>
    ${textarea("field_reasonForReferral", "Reason for referral", "note-field", fields.reasonForReferral || appointmentReasonForReferral(appointment))}
    ${textarea("field_medicalHistory", "Medical history", "note-field", fields.medicalHistory || client.diagnosis || "")}
    ${textarea("field_currentHomeSetUp", "Current home set up", "note-field", fields.currentHomeSetUp || "")}
    ${textarea("field_subjective", "Subjective", "note-field", fields.subjective || "")}
    <section class="clinical-block full">
      <div class="section-heading">
        <h4>Objective</h4>
        ${statusPill(`${selectedMeasures.length} selected`, selectedMeasures.length ? "blue" : "gold")}
      </div>
      ${textarea("field_objectiveObservations", "Objective observations", "full", fields.objectiveObservations || "")}
      ${renderOutcomeMeasurePicker(selectedMeasures)}
      <div id="custom-outcome-wrap" class="${selectedMeasures.includes("other") ? "full" : "full hidden"}">
        ${textarea("field_customOutcomeMeasures", "Other outcome measures", "full", fields.customOutcomeMeasures || "")}
      </div>
      <div id="outcome-measure-table-wrap">
        ${renderOutcomeMeasureTable(allMeasures, fields)}
      </div>
      <div id="normative-values-wrap">
        ${renderNormativeValues(allMeasures)}
      </div>
    </section>
    ${textarea("field_assessment", "Assessment", "note-field", fields.assessment || "")}
    ${textarea("field_treatment", "Treatment", "note-field", fields.treatment || "")}
    ${textarea("field_recommendations", "Recommendations", "note-field", fields.recommendations || "")}
    ${textarea("field_plan", "Plan", "note-field", fields.plan || "")}
  `;
}

function renderOutcomeMeasureTable(measures, fields = {}) {
  if (!measures.length) return emptyState("No outcome measures selected.");

  return `
    <div class="table-wrap outcome-table">
      <table>
        <thead>
          <tr>
            <th>Outcome measure</th>
            <th>Score / details</th>
            <th>Normative / reference value</th>
            <th>Clinical note</th>
          </tr>
        </thead>
        <tbody>
          ${measures.map((measure) => {
            const normativeValue = fields[`outcome_${measure.id}_normativeValue`] || measure.reference || "";
            return `
              <tr>
                <td data-label="Outcome measure"><strong>${escapeHtml(measure.label)}</strong></td>
                <td data-label="Score / details"><textarea name="field_outcome_${measure.id}_details">${escapeHtml(fields[`outcome_${measure.id}_details`] || "")}</textarea></td>
                <td data-label="Normative / reference value"><textarea name="field_outcome_${measure.id}_normativeValue">${escapeHtml(normativeValue)}</textarea></td>
                <td data-label="Clinical note">${aiTextarea(`field_outcome_${measure.id}_clinicalNote`, "Clinical note", "", fields[`outcome_${measure.id}_clinicalNote`] || "", "outcomeClinicalNote")}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderOutcomeMeasurePicker(selectedMeasures = []) {
  return `
    <fieldset class="outcome-measure-picker full">
      <legend>Outcome measures</legend>
      <div class="outcome-measure-options" id="outcome-measure-options">
        ${physioOutcomeMeasures.map((measure) => {
          const checked = selectedMeasures.includes(measure.id);
          return `
            <label class="outcome-measure-chip ${checked ? "selected" : ""}">
              <input type="checkbox" name="field_outcomeMeasures" value="${escapeHtml(measure.id)}" ${checked ? "checked" : ""}>
              <span>${escapeHtml(measure.label)}</span>
            </label>
          `;
        }).join("")}
      </div>
    </fieldset>
  `;
}

function renderNormativeValues(measures) {
  if (!measures.length) return "";

  return `
    <div class="normative-panel">
      <h4>Normative values</h4>
      <div class="grid">
        ${measures.map((measure) => `<article>
            <strong>${escapeHtml(measure.label)}</strong>
            <p>${escapeHtml(measure.reference)}</p>
          </article>`).join("")}
      </div>
    </div>
  `;
}

function renderReports() {
  const data = state.data;
  const selectedAppointment = data.appointments.find((appointment) => appointment.id === state.reportAppointmentId) || null;
  const selectedTemplate = data.reportTemplates.find((template) => template.type === state.reportType) || data.reportTemplates[0];
  const reportFields = selectedTemplate.fields.filter((field) => !["Participant Details", "Therapist Signature"].includes(field));
  const selectedClientId = state.reportClientId || selectedAppointment?.clientId || data.clients[0]?.id || "";
  const selectedContractorId = state.reportContractorId
    || selectedAppointment?.contractorId
    || (data.currentUser.role === "contractor"
      ? data.currentUser.id
      : ownerViewingPractitioner()
      ? currentCalendarPractitionerId()
      : data.contractors[0]?.id || "");
  const selectedContractor = data.contractors.find((contractor) => contractor.id === selectedContractorId)
    || data.users.find((user) => user.id === selectedContractorId)
    || data.currentUser;
  const existingReport = selectedAppointment ? exactReportForAppointment(selectedAppointment) : null;
  const draftKey = reportDraftKey(selectedAppointment?.id || "", state.reportType);
  const reportFieldsValue = state.reportDraftKey === draftKey
    ? { ...(existingReport?.fields || {}), ...state.reportDraftFields }
    : existingReport?.fields || {};
  const reportSummary = state.reportDraftKey === draftKey ? state.reportDraftSummary : existingReport?.summary || "";
  const readyForReviewLabel = data.currentUser.role === "contractor" || ownerViewingPractitioner()
    ? "Sign off for admin review"
    : "Ready for admin review";

  return `
    <section class="section report-focus-section">
      <div class="section-heading"><h3>Current report</h3><span>${data.currentUser.role === "contractor" ? "Sign off sends a copy to admin" : "Draft PDF-ready content"}</span></div>
      <form class="card form-grid report-mobile-form" id="report-form">
        <input type="hidden" name="id" value="${existingReport?.id || ""}">
        <input type="hidden" name="appointmentId" value="${selectedAppointment?.id || ""}">
        ${select("type", "Report type", data.reportTemplates.map((template) => template.type), state.reportType, "full", "report-type-select")}
        ${select("clientId", "Client", data.clients.map((client) => [client.id, client.name]), selectedClientId)}
        ${select("contractorId", "Therapist", data.contractors.map((contractor) => [contractor.id, contractor.name]), selectedContractorId)}
        ${selectedAppointment ? `<div class="pill blue full">Linked to ${escapeHtml(formatAppointmentLabel(selectedAppointment.id))}</div>` : ""}
        ${isEquipmentTrialReport(state.reportType)
          ? aiTextarea("summary", "Summary", "full", reportSummary, "equipmentSummary")
          : aiTextarea("summary", "Summary", "full", reportSummary, "summary")}
        ${isInitialPhysioReport(state.reportType)
          ? renderInitialPhysioReportFields(selectedAppointment, reportFieldsValue)
          : isEquipmentTrialReport(state.reportType)
          ? renderEquipmentTrialReportFields(reportFieldsValue)
          : reportFields.map((field) => aiTextarea(`field_${fieldKey(field)}`, field, "full", reportFieldsValue[fieldKey(field)] || "", fieldKey(field))).join("")}
        ${renderReportSignaturePanel(selectedContractor, existingReport)}
        <div class="form-actions full">
          <button type="submit" name="mode" value="draft" class="secondary">Save draft</button>
          <button type="submit" name="mode" value="ready_for_admin">${readyForReviewLabel}</button>
          ${data.currentUser.role === "admin" ? `<button type="submit" name="mode" value="final">Mark final</button>` : ""}
        </div>
      </form>
    </section>
  `;
}

function renderReportSignaturePanel(contractor = {}, existingReport = null) {
  const currentUser = state.data.currentUser || {};
  const isOwnSignature = contractor.id === currentUser.id;
  const canManageSignature = isOwnSignature || currentUser.role === "admin";
  const savedSignature = isOwnSignature ? currentUser.signatureDataUrl || "" : contractor.signatureDataUrl || "";
  const hasSignature = Boolean(savedSignature || contractor.hasSignature);
  const printedName = existingReport?.signature || contractor.name || currentUser.name || "";
  const title = professionalTitleForUser(contractor);
  const signatureOwnerLabel = isOwnSignature ? "your" : `${contractor.name || "this therapist"}'s`;

  return `
    <section class="clinical-block report-signature-panel full">
      <div class="section-heading">
        <h4>Signature</h4>
        ${statusPill(hasSignature ? "saved signature" : "typed name only", hasSignature ? "blue" : "gold")}
      </div>
      <p class="form-hint">The final PDF will show the referral thank-you message, Warm regards, ${escapeHtml(signatureOwnerLabel)} saved drawn signature, then the name and title.</p>
      ${input("signature", "Name printed on report", "text", false, "full", printedName)}
      <div class="signature-preview-card">
        <span>${escapeHtml(REPORT_CLOSING_PREVIEW_TEXT())}</span>
        <strong>Warm regards,</strong>
        ${savedSignature
          ? `<img src="${escapeHtml(savedSignature)}" alt="Saved practitioner signature">`
          : `<em>${hasSignature ? "Signature saved on therapist profile." : "No drawn signature saved yet."}</em>`}
        <strong>${escapeHtml(printedName)}</strong>
        <span>${escapeHtml(title)}</span>
      </div>
      ${canManageSignature ? `
        <div class="signature-pad-wrap">
          <canvas id="signature-pad" width="520" height="160" aria-label="Draw signature" data-user-id="${escapeHtml(contractor.id || currentUser.id)}"></canvas>
          <div class="mini-actions">
            <button type="button" class="secondary" data-action="signature-clear-canvas">Clear drawing</button>
            <button type="button" data-action="signature-save">Save signature</button>
            ${savedSignature ? `<button type="button" class="secondary" data-action="signature-clear-saved" data-user-id="${escapeHtml(contractor.id || currentUser.id)}">Remove saved signature</button>` : ""}
          </div>
        </div>
      ` : `
        <div class="empty-inline">Only admin or the practitioner can add or change this drawn signature.</div>
      `}
    </section>
  `;
}

function REPORT_CLOSING_PREVIEW_TEXT() {
  return "Thank you again for your kind referral! If you have any questions, please feel free to call (07) 3216 1330 or email hello@refinehealthgroup.com.au.";
}

function renderInitialPhysioReportFields(appointment, fields = {}) {
  const client = appointment ? state.data.clients.find((item) => item.id === appointment.clientId) || {} : {};
  const selectedMeasures = selectedOutcomeMeasuresForAppointment(outcomeMeasureContextKey(), fields);
  const customMeasures = customOutcomeMeasuresFromFields(fields);
  const allMeasures = outcomeMeasureRows(selectedMeasures, customMeasures);

  return `
    <div class="pill blue full">Initial physiotherapy assessment structure</div>
    ${aiTextarea("field_reasonForReferral", "Reason for referral", "full", fields.reasonForReferral || (appointment ? appointmentReasonForReferral(appointment) : ""), "reasonForReferral")}
    ${aiTextarea("field_medicalHistory", "Medical history", "full", fields.medicalHistory || client.diagnosis || "", "medicalHistory")}
    ${aiTextarea("field_currentHomeSetUp", "Current home set up", "full", fields.currentHomeSetUp || "", "currentHomeSetUp")}
    ${aiTextarea("field_subjective", "Subjective", "full", fields.subjective || "", "subjective")}
    <section class="clinical-block full">
      <div class="section-heading">
        <h4>Objective</h4>
        ${statusPill(`${selectedMeasures.length} selected`, selectedMeasures.length ? "blue" : "gold")}
      </div>
      ${aiTextarea("field_objectiveObservations", "Objective observations", "full", fields.objectiveObservations || "", "objective")}
      ${renderOutcomeMeasurePicker(selectedMeasures)}
      <div id="custom-outcome-wrap" class="${selectedMeasures.includes("other") ? "full" : "full hidden"}">
        ${aiTextarea("field_customOutcomeMeasures", "Other outcome measures", "full", fields.customOutcomeMeasures || "", "outcomeMeasures")}
      </div>
      <div id="outcome-measure-table-wrap">
        ${renderOutcomeMeasureTable(allMeasures, fields)}
      </div>
      <div id="normative-values-wrap">
        ${renderNormativeValues(allMeasures)}
      </div>
    </section>
    ${aiTextarea("field_assessment", "Assessment", "full", fields.assessment || "", "assessment")}
    ${aiTextarea("field_treatment", "Treatment", "full", fields.treatment || "", "treatment")}
    ${aiTextarea("field_recommendations", "Recommendations", "full", fields.recommendations || "", "recommendations")}
    ${renderReportPhotoAttachments(fields)}
    ${aiTextarea("field_plan", "Plan", "full", fields.plan || "", "plan")}
  `;
}

function renderReportPhotoAttachments(fields = {}) {
  const photos = reportPhotoAttachmentsFromFields(fields);
  const remaining = Math.max(0, REPORT_PHOTO_LIMIT - photos.length);
  const hiddenValue = escapeHtml(JSON.stringify(photos));

  return `
    <section class="clinical-block report-photo-block full">
      <input type="hidden" name="field_photoAttachments" value="${hiddenValue}">
      <div class="section-heading">
        <h4>Photos for PDF</h4>
        ${statusPill(`${photos.length}/${REPORT_PHOTO_LIMIT} added`, photos.length ? "blue" : "gold")}
      </div>
      <p class="form-hint">Take photos from the phone camera or upload images. They will be compressed and added to the signed initial report PDF.</p>
      <label class="photo-upload-control">
        <span>${remaining ? "Take or upload photos" : "Photo limit reached"}</span>
        <input type="file" accept="image/*" capture="environment" multiple data-action="report-photo-input" ${remaining ? "" : "disabled"}>
      </label>
      ${photos.length
        ? `<div class="report-photo-grid">
            ${photos.map((photo, index) => `
              <article class="report-photo-preview">
                <div class="report-photo-frame">
                  <img src="${escapeHtml(reportPhotoImageSrc(photo))}" alt="${escapeHtml(`Photo ${index + 1}`)}">
                  <span class="photo-index-badge">${index + 1}</span>
                </div>
                <div>
                  <strong>${escapeHtml(`Photo ${index + 1}`)}</strong>
                  <span>${escapeHtml(photo.name || "Camera photo")} · ${escapeHtml(reportPhotoSizeLabel(photo))}</span>
                </div>
                <label class="report-photo-note">
                  Notes for this photo
                  <textarea data-action="report-photo-note" data-index="${index}" rows="3" placeholder="Add photo notes for the PDF">${escapeHtml(photo.note || "")}</textarea>
                </label>
                <button type="button" class="secondary" data-action="remove-report-photo" data-index="${index}">Remove</button>
              </article>
            `).join("")}
          </div>`
        : `<div class="empty-inline">No photos attached yet.</div>`}
    </section>
  `;
}

function renderEquipmentTrialReportFields(fields = {}) {
  const trialCount = equipmentTrialCount(fields);
  return `
    <section class="clinical-block equipment-trials full">
      <div class="section-heading">
        <h4>Trialled equipment</h4>
        ${statusPill(`${trialCount} trial${trialCount === 1 ? "" : "s"}`, "blue")}
      </div>
      ${Array.from({ length: trialCount }, (_, index) => renderEquipmentTrialBlock(index + 1, fields)).join("")}
      <div class="form-actions">
        <button type="button" class="secondary" data-action="add-equipment-trial">Add another equipment trial</button>
      </div>
      ${renderEquipmentRecommendations(fields)}
    </section>
  `;
}

function renderEquipmentTrialBlock(trialIndex, fields = {}) {
  const optionCount = equipmentOptionCount(trialIndex, fields);
  const title = fields[`equipmentTrial_${trialIndex}_title`] || `Trialled equipment ${trialIndex}`;
  return `
    <section class="equipment-trial-block" data-trial-index="${trialIndex}">
      <div class="section-heading">
        <h4>${escapeHtml(title)}</h4>
        ${statusPill(`${optionCount} option${optionCount === 1 ? "" : "s"}`)}
      </div>
      ${input(`field_equipmentTrial_${trialIndex}_title`, "Rename trial section", "text", false, "full", title)}
      <div class="equipment-option-list">
        ${Array.from({ length: optionCount }, (_, index) => {
          const optionIndex = index + 1;
          return `
            <div class="equipment-model-row">
              ${input(
                `field_equipmentTrial_${trialIndex}_option_${optionIndex}_name`,
                `${optionIndex}. Model`,
                "text",
                false,
                "",
                fields[`equipmentTrial_${trialIndex}_option_${optionIndex}_name`] || ""
              )}
              ${optionCount > 2 ? `<button type="button" class="secondary" data-action="delete-equipment-option" data-trial-index="${trialIndex}" data-option-index="${optionIndex}">Delete</button>` : ""}
            </div>
          `;
        }).join("")}
      </div>
      <div class="form-actions">
        <button type="button" class="secondary" data-action="add-equipment-option" data-trial-index="${trialIndex}">Add equipment option</button>
      </div>
      ${input(`field_equipmentTrial_${trialIndex}_chosenModel`, "Chosen equipment model", "text", false, "full", fields[`equipmentTrial_${trialIndex}_chosenModel`] || "")}
      ${aiTextarea(`field_equipmentTrial_${trialIndex}_chosenReason`, "Why this model was chosen", "full", fields[`equipmentTrial_${trialIndex}_chosenReason`] || "", "equipmentChosenReason")}
    </section>
  `;
}

function renderEquipmentRecommendations(fields = {}) {
  return `
    <section class="equipment-recommendation-block full">
      <div class="section-heading">
        <h4>Recommendations</h4>
        ${statusPill("auto from chosen models", "blue")}
      </div>
      <div id="equipment-recommendation-list">
        ${renderChosenModelRecommendations(fields)}
      </div>
      ${aiTextarea("field_equipmentAdditionalRecommendations", "Additional recommendations", "full", fields.equipmentAdditionalRecommendations || "", "equipmentRecommendations")}
      ${aiTextarea("field_equipmentPlan", "Plan", "full", fields.equipmentPlan || "", "equipmentPlan")}
    </section>
  `;
}

function renderChosenModelRecommendations(fields = {}) {
  const chosenModels = chosenEquipmentModels(fields);
  if (!chosenModels.length) return emptyState("Chosen equipment models will appear here automatically.");

  return `
    <ul class="recommendation-list">
      ${chosenModels.map((item) => `<li><strong>${escapeHtml(item.title)}</strong>: ${escapeHtml(item.model)}</li>`).join("")}
    </ul>
  `;
}

function renderNotesDueList() {
  const dueAppointments = sortAppointments(state.data.appointments.filter((appointment) =>
    appointmentNotesDue(appointment) && dueBucket(appointment) !== "upcoming"
  ));
  return `
    <section class="section">
      <div class="section-heading"><h3>Notes due</h3><span>${dueAppointments.length} incomplete</span></div>
      ${renderDueGroups(dueAppointments, renderNotesDueCard, "No notes are due.")}
    </section>
  `;
}

function renderReportsDueList() {
  const dueAppointments = sortAppointments(state.data.appointments.filter((appointment) =>
    appointmentReportDue(appointment) && reportDueBucket(appointment) !== "upcoming"
  ));
  const completedReports = completedReportsForAdmin(filterItems(state.data.reports || []));
  return `
    <section class="section">
      <div class="section-heading"><h3>Reports due</h3><span>${dueAppointments.length} incomplete</span></div>
      ${renderDueGroups(dueAppointments, renderReportsDueCard, "No reports are due.", reportDueBucket, { today: "Due now" })}
    </section>
    <section class="section">
      <div class="section-heading"><h3>Completed reports</h3><span>${completedReports.length} ready</span></div>
      <div class="grid cards-3">
        ${completedReports.map(renderCompletedReportCard).join("") || emptyState("No completed reports yet.")}
      </div>
    </section>
  `;
}

function renderDueGroups(appointments, cardRenderer, emptyText, bucketFn = dueBucket, labels = {}) {
  if (!appointments.length) return emptyState(emptyText);
  const groups = [
    [labels.overdue || "Overdue", appointments.filter((appointment) => bucketFn(appointment) === "overdue")],
    [labels.today || "Today", appointments.filter((appointment) => bucketFn(appointment) === "today")],
    [labels.upcoming || "Upcoming", appointments.filter((appointment) => bucketFn(appointment) === "upcoming")]
  ].filter(([, items]) => items.length);

  return `<div class="grid">${groups.map(([label, items]) => `
    <section class="section due-group">
      <div class="section-heading"><h3>${escapeHtml(label)}</h3><span>${items.length}</span></div>
      <div class="grid cards-3">${items.map(cardRenderer).join("")}</div>
    </section>
  `).join("")}</div>`;
}

function renderNotesDueCard(appointment) {
  return `
    <article class="card">
      <div class="section-heading">
        <h4>${patientNameButton(appointment.clientId, clientName(appointment.clientId))}</h4>
        ${statusPill(dueBucketLabel(appointment), dueBucket(appointment) === "overdue" ? "coral" : "blue")}
      </div>
      <div class="detail-list">
        <div><strong>Time</strong>${formatDateTime(appointment.startsAt)} - ${formatTime(appointment.endsAt)}</div>
        <div><strong>Appointment type</strong>${escapeHtml(appointment.appointmentType || appointment.recurrence || appointment.serviceType)}</div>
        <div><strong>Contact</strong>${phoneLink(appointmentContactNumber(appointment), "No mobile recorded")}</div>
        ${appointmentReasonDetailHtml(appointment, "Reason for referral")}
        ${clinikoAppointmentNoteDetailHtml(appointment, { compact: true })}
      </div>
      <div class="actions">
        <button data-action="open-note" data-id="${appointment.id}">Complete note</button>
      </div>
    </article>
  `;
}

function renderAdminReportDueCard(appointment) {
  const report = exactReportForAppointment(appointment);
  const status = report?.status || "not_started";
  return `
    <article class="card overview-item">
      <div class="section-heading">
        <h4>${patientNameButton(appointment.clientId, clientName(appointment.clientId))}</h4>
        ${statusPill(reportStatusLabel(status), reportTone(status))}
      </div>
      <div class="meta-row">
        ${statusPill(reportTypeForAppointment(appointment), "blue")}
        ${statusPill(reportDueAgeLabel(appointment), reportDueBucket(appointment) === "overdue" ? "coral" : "gold")}
      </div>
      <div class="detail-list compact">
        <div><strong>Appointment</strong>${formatDateTime(appointment.startsAt)}</div>
        <div><strong>Practitioner</strong>${escapeHtml(userName(appointment.contractorId))}</div>
        ${report?.adminCopySentAt ? `<div><strong>Admin copy</strong>Received ${formatDateTime(report.adminCopySentAt)}</div>` : ""}
      </div>
      <div class="actions">
        <button data-action="report-reminder" data-id="${appointment.id}">Remind to finish report</button>
        ${report ? `
          <button class="secondary" data-action="open-report" data-id="${report.id}">Open draft</button>
          <a class="button secondary" href="/api/reports/${report.id}/pdf" target="_blank" rel="noreferrer">Download PDF</a>
        ` : ""}
      </div>
    </article>
  `;
}

function renderAdminNoteDueCard(appointment) {
  const daysOverdue = noteDaysOverdue(appointment);
  return `
    <article class="card overview-item note-due-card ${daysOverdue > 0 ? "is-overdue" : ""}">
      <div class="section-heading">
        <h4>${patientNameButton(appointment.clientId, clientName(appointment.clientId))}</h4>
        ${statusPill(noteDueAgeLabel(appointment), daysOverdue > 0 ? "coral" : "gold")}
      </div>
      <div class="meta-row">
        ${statusPill(appointment.appointmentType || appointment.recurrence || appointment.serviceType, appointmentTypeColour(appointment)?.pillTone || "blue")}
      </div>
      <div class="detail-list compact">
        <div><strong>Appointment</strong>${formatDateTime(appointment.startsAt)}</div>
        <div><strong>Practitioner</strong>${escapeHtml(userName(appointment.contractorId))}</div>
      </div>
      <div class="actions">
        <button data-action="open-note" data-id="${appointment.id}">Open note</button>
      </div>
    </article>
  `;
}

function renderReportsDueCard(appointment) {
  const report = exactReportForAppointment(appointment);
  const status = report?.status || "not_started";
  return `
    <article class="card">
      <div class="section-heading">
        <h4>${patientNameButton(appointment.clientId, clientName(appointment.clientId))}</h4>
        ${statusPill(reportStatusLabel(status), reportTone(status))}
      </div>
      <div class="meta-row">
        ${statusPill(reportTypeForAppointment(appointment), "blue")}
        ${statusPill(reportDueAgeLabel(appointment), reportDueBucket(appointment) === "overdue" ? "coral" : "gold")}
      </div>
      <div class="detail-list">
        <div><strong>Time</strong>${formatDateTime(appointment.startsAt)} - ${formatTime(appointment.endsAt)}</div>
        <div><strong>Contact</strong>${phoneLink(appointmentContactNumber(appointment), "No mobile recorded")}</div>
        ${appointmentReasonDetailHtml(appointment, "Reason for referral")}
        ${clinikoAppointmentNoteDetailHtml(appointment, { compact: true })}
      </div>
      <div class="actions">
        ${state.data.currentUser.role === "admin"
          ? `<button data-action="report-reminder" data-id="${appointment.id}">Remind to finish report</button>
             ${report
              ? `<button class="secondary" data-action="open-report" data-id="${report.id}">Open draft</button>
                 <a class="button secondary" href="/api/reports/${report.id}/pdf" target="_blank" rel="noreferrer">Download PDF</a>`
              : ""}`
          : `<button data-action="complete-report" data-id="${appointment.id}">${report ? "Continue report" : "Start report"}</button>`}
      </div>
    </article>
  `;
}

function renderRequests() {
  const data = state.data;
  const clients = clientsForPractitionerWorkspace(data.clients);
  const practitionerId = currentCalendarPractitionerId();
  const approvalRequests = ownerViewingPractitioner()
    ? (data.approvalRequests || []).filter((request) => request.contractorId === practitionerId)
    : data.approvalRequests;
  const selectedClient = clients.find((client) => client.id === state.approvalClientId)
    || clients[0];

  return `
    <div class="two-col">
      <section class="section">
        <div class="section-heading"><h3>Approvals needed</h3><span>Case manager action</span></div>
        ${selectedClient ? `
          <form class="card form-grid" id="approval-form">
            <input type="hidden" name="contractorId" value="${escapeHtml(practitionerId)}">
            <input type="hidden" name="source" value="case_manager_approval">
            <input type="hidden" name="type" value="Approvals needed">
            <input type="hidden" name="adminAction" value="Ask case manager for approval">
            ${select("clientId", "Client", clients.map((client) => [client.id, client.name]), selectedClient.id, "", "approval-client-select")}
            ${select("approvalNeedType", "Approval needed for", [
              "Equipment trial",
              "Ongoing physio",
              "Treatment frequency change",
              "Other case manager approval"
            ])}
            ${textarea("details", "Message to admin", "full")}
            <div class="form-actions full">
              <button type="submit">Send to admin</button>
            </div>
          </form>
        ` : emptyState("No assigned clients available.")}
      </section>
      <section class="section">
        <div class="section-heading"><h3>Approval history</h3><span>${approvalRequests.length}</span></div>
        <div class="grid">${sortApprovalRequests(approvalRequests).map(renderApprovalCard).join("") || emptyState("No approval requests yet.")}</div>
      </section>
    </div>
  `;
}

function renderCliniko() {
  const data = state.data;
  const setupReady = Boolean(enabledClinikoLocations().length && enabledClinikoPractitioners().length);
  return `
    <section class="section">
      <div class="section-heading"><h3>Cliniko integration</h3><span>${data.clinikoConfig.connected ? "Configured" : "Not connected"}</span></div>
      <div class="grid cards-3">
        <article class="card">
          <h4>Connection</h4>
          <div class="meta-row">
            ${statusPill(data.clinikoSync.status.replaceAll("_", " "), data.clinikoConfig.connected ? "blue" : "gold")}
            ${statusPill(data.clinikoConfig.appointmentWriteEnabled ? "write enabled" : "read only", data.clinikoConfig.appointmentWriteEnabled ? "coral" : "blue")}
            ${statusPill(data.clinikoConfig.appointmentCreateEnabled ? "booking sync on" : "booking sync off", data.clinikoConfig.appointmentCreateEnabled ? "coral" : "gold")}
            ${statusPill(data.clinikoConfig.pollEnabled ? "polling on" : "polling off", data.clinikoConfig.pollEnabled ? "blue" : "gold")}
            ${statusPill(data.clinikoConfig.baseUrl.includes("au1") ? "AU region" : "Custom region")}
            ${statusPill(setupReady ? "setup selected" : "choose setup", setupReady ? "blue" : "gold")}
          </div>
          <p>${escapeHtml(data.clinikoSync.message || "Ready to sync when configured.")}</p>
          <p>Use a Cliniko test API key first. The first sync imports locations and practitioners so you can choose what is active before patient appointments are imported.</p>
          <div class="actions">
            <button data-action="sync-cliniko">Sync now</button>
          </div>
        </article>
        <article class="card">
          <h4>Source of truth</h4>
          <div class="detail-list">
            <div><strong>Cliniko</strong>Patients, practitioners, appointments, calendars, scheduling</div>
            <div><strong>This portal</strong>Mobile workflow status, notes, report drafts, approval requests, admin review</div>
            <div><strong>Live updates</strong>${data.clinikoConfig.webhooksAvailable ? "Webhook-capable" : `Safe polling every ${escapeHtml(pollingIntervalLabel(data.clinikoConfig).replace(" polling", ""))}`}</div>
          </div>
        </article>
        <article class="card">
          <h4>Last sync</h4>
          <p>${data.clinikoSync.lastSyncAt ? formatDateTime(data.clinikoSync.lastSyncAt) : "No live sync yet."}</p>
          <p>Cliniko calendar edits appear after the next polling cycle. API keys stay server-side in environment variables only.</p>
          <div class="meta-row">
            ${data.clinikoConfig.syncStartDate
              ? statusPill(`from ${data.clinikoConfig.syncStartDate}`, "blue")
              : statusPill(`${data.clinikoConfig.appointmentSyncPastDays || 14}d past`, "blue")}
            ${statusPill(`${data.clinikoConfig.appointmentSyncFutureDays || 90}d future`, "blue")}
            ${statusPill(pollingIntervalLabel(data.clinikoConfig), data.clinikoConfig.pollEnabled ? "blue" : "gold")}
            ${statusPill(data.clinikoConfig.noteUploadEnabled ? "note files on" : "note files off", data.clinikoConfig.noteUploadEnabled ? "blue" : "gold")}
            ${statusPill(data.clinikoConfig.noteUploadAutoEnabled ? "note auto on" : "note auto off", data.clinikoConfig.noteUploadAutoEnabled ? "blue" : "gold")}
            ${statusPill(data.clinikoConfig.reportUploadEnabled ? "report uploads on" : "report uploads off", data.clinikoConfig.reportUploadEnabled ? "blue" : "gold")}
            ${statusPill(data.clinikoConfig.patientCreateEnabled ? "new patients on" : "new patients off", data.clinikoConfig.patientCreateEnabled ? "blue" : "gold")}
          </div>
        </article>
      </div>
      <section class="section">
        <div class="section-heading"><h3>Cliniko locations</h3><span>${enabledClinikoLocations().length || 0} active for testing</span></div>
        <p class="muted">Cliniko calls locations businesses. This setup stores all locations, but only one is active for testing unless multi-location sync is enabled later.</p>
        ${renderClinikoLocationsTable()}
      </section>
      <section class="section">
        <div class="section-heading"><h3>Cliniko practitioners</h3><span>${enabledClinikoPractitioners().length || 0} active for testing</span></div>
        <p class="muted">Choose the practitioner whose Cliniko appointments should appear in this app. Patient details are only pulled for appointments matching the active location and active practitioner.</p>
        ${renderClinikoPractitionersTable()}
      </section>
      <section class="section">
        <div class="section-heading"><h3>Sync errors</h3><span>${data.syncErrors.length}</span></div>
        ${data.syncErrors.length ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Time</th><th>Operation</th><th>Record</th><th>Error</th><th>Action</th></tr></thead>
              <tbody>
                ${data.syncErrors.map((item) => `<tr><td>${formatDateTime(item.createdAt)}</td><td>${escapeHtml(item.operation)}</td><td>${escapeHtml(item.entityType)} ${escapeHtml(item.entityId)}</td><td>${escapeHtml(item.resolvedAt ? "Resolved" : item.message)}</td><td>${item.resolvedAt ? statusPill("resolved", "blue") : `<button type="button" class="secondary" data-action="sync-error-retry" data-id="${escapeHtml(item.id)}">Retry</button>`}</td></tr>`).join("")}
              </tbody>
            </table>
          </div>
        ` : emptyState("No sync errors recorded.")}
      </section>
      <section class="section">
        <div class="section-heading"><h3>Sync log</h3><span>${data.clinikoSyncLogs.length}</span></div>
        ${data.clinikoSyncLogs.length ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Time</th><th>Status</th><th>Operation</th><th>Message</th></tr></thead>
              <tbody>
                ${data.clinikoSyncLogs.map((item) => `<tr><td>${formatDateTime(item.createdAt)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.operation)}</td><td>${escapeHtml(item.message || "")}</td></tr>`).join("")}
              </tbody>
            </table>
          </div>
        ` : emptyState("No sync activity yet.")}
      </section>
      <section class="section">
        <div class="section-heading"><h3>Recent activity</h3><span>${data.activityLog.length}</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th></tr></thead>
            <tbody>
              ${data.activityLog.map((item) => `<tr><td>${formatDateTime(item.createdAt)}</td><td>${escapeHtml(userName(item.actorId))}</td><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.entityType)} ${escapeHtml(item.entityId)}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  `;
}

function renderUserManagement() {
  const users = state.data.users || [];
  return `
    <section class="section users-admin-view">
      <div class="section-heading"><h3>User management</h3><span>${users.length} accounts</span></div>
      <div class="user-management-layout">
        <form class="card compact form-grid dense-form user-create-card" id="user-create-form">
          <div class="section-heading full">
            <h4>Create staff account</h4>
            <span>Refine app login only</span>
          </div>
          <p class="form-helper full">This creates access to this Refine app only. A Cliniko practitioner ID links the schedule, but it does not create or share a Cliniko login.</p>
          ${input("name", "Full name", "text", true)}
          ${input("email", "Email", "email", true)}
          ${select("role", "Role", [
            ["admin", "Admin"],
            ["receptionist", "Receptionist"],
            ["contractor", "Practitioner / contractor"]
          ], "contractor")}
          ${input("discipline", "Discipline", "text", false, "", "Physiotherapy")}
          <div class="working-hours-row full">
            ${input("workingStart", "Working start", "time", false, "", "09:00")}
            ${input("workingEnd", "Working finish", "time", false, "", "17:00")}
          </div>
          ${input("clinikoPractitionerId", "Cliniko practitioner ID", "text")}
          ${input("password", "Temporary password", "password", true)}
          <div class="form-actions full">
            <button type="submit">Create user</button>
          </div>
        </form>
        <section class="section user-directory">
          <div class="section-heading"><h3>Existing users</h3><span>Roles and access</span></div>
          <div class="user-list">
            ${users.map(renderUserManagementCard).join("") || emptyState("No users yet.")}
          </div>
        </section>
      </div>
    </section>
  `;
}

function renderUserManagementCard(user) {
  return `
    <article class="card compact user-card">
      <form class="form-grid dense-form user-edit-form" data-user-id="${escapeHtml(user.id)}">
        <div class="section-heading full">
          <h4>${escapeHtml(user.name || user.email)}</h4>
          <div class="meta-row">
            ${statusPill(user.isOwner ? "Owner" : roleLabel(user.role), user.role === "admin" ? "blue" : user.role === "receptionist" ? "gold" : "")}
            ${statusPill(user.isActive ? "active" : "inactive", user.isActive ? "blue" : "coral")}
            ${statusPill(user.hasPassword ? "app login ready" : "needs app password", user.hasPassword ? "blue" : "gold")}
            ${user.role === "contractor" ? statusPill(user.hasSignature ? "signature saved" : "no signature", user.hasSignature ? "blue" : "gold") : ""}
          </div>
        </div>
        ${input("name", "Name", "text", true, "", user.name || "")}
        ${input("email", "Email", "email", true, "", user.email || "")}
        ${select("role", "Role", [
          ["admin", "Admin"],
          ["receptionist", "Receptionist"],
          ["contractor", "Practitioner / contractor"]
        ], user.role || "contractor")}
        ${input("discipline", "Discipline", "text", false, "", user.discipline || "")}
        ${user.role === "contractor" ? `
          <div class="working-hours-row full">
            ${input("workingStart", "Working start", "time", false, "", practitionerWorkingStart(user))}
            ${input("workingEnd", "Working finish", "time", false, "", practitionerWorkingEnd(user))}
          </div>
        ` : ""}
        ${input("clinikoPractitionerId", "Cliniko practitioner ID", "text", false, "", user.clinikoPractitionerId || "")}
        <label>Access
          <select name="isActive">
            <option value="true" ${user.isActive ? "selected" : ""}>Active</option>
            <option value="false" ${!user.isActive ? "selected" : ""}>Inactive</option>
          </select>
        </label>
        <div class="form-actions full">
          <button type="submit">Save user</button>
        </div>
      </form>
      <form class="form-grid dense-form password-reset-form" data-user-id="${escapeHtml(user.id)}">
        ${input("password", "New temporary password", "password", true)}
        <div class="form-actions">
          <button type="submit" class="secondary">Reset password</button>
        </div>
      </form>
    </article>
  `;
}

function renderReferralCard(referral) {
  const assigned = state.data.users.find((user) => user.id === referral.assignedContractorId);
  const caseManager = caseManagerFromReferral(referral);
  const canEditReferral = state.data.currentUser?.role === "admin";
  const editing = state.editReferralId === referral.id;
  return `
    <article class="card" data-referral-id="${referral.id}">
      <div class="section-heading">
        <h4>${escapeHtml(referral.clientName)}</h4>
        ${statusPill(referral.status, referral.urgency === "High" || referral.urgency === "Urgent" ? "coral" : "")}
      </div>
      <div class="meta-row">
        ${statusPill(referral.serviceTypeRequired, "blue")}
        ${statusPill(referral.urgency, referral.urgency === "Low" ? "" : "gold")}
        ${referral.suburb ? statusPill(referral.suburb) : ""}
      </div>
      <div class="detail-list">
        <div><strong>Reason for referral</strong>${escapeHtml(referralReason(referral) || "No reason recorded.")}</div>
        <div><strong>Risks</strong>${escapeHtml(referral.risks || "No alerts.")}</div>
        <div><strong>Assigned</strong>${escapeHtml(assigned?.name || "Unassigned")}</div>
        <div><strong>Case manager</strong>${escapeHtml(caseManager ? caseManagerLabel(caseManager) : referral.caseManager || "Not assigned")}</div>
      </div>
      ${canEditReferral ? `
        ${editing ? renderReferralEditForm(referral) : `
          <div class="mini-actions">
            <button type="button" class="secondary" data-action="referral-edit" data-id="${escapeHtml(referral.id)}">Edit referral</button>
          </div>
        `}
      ` : ["receptionist"].includes(state.data.currentUser.role) ? `
        <div class="form-grid">
          ${select(`assign_${referral.id}`, "Assign", contractorOptions(true), referral.assignedContractorId, "", "", `data-action="assign-referral" data-id="${referral.id}"`)}
          ${select(`status_${referral.id}`, "Status", state.data.referralStatuses, referral.status, "", "", `data-action="referral-status" data-id="${referral.id}"`)}
        </div>
      ` : ""}
    </article>
  `;
}

function renderReferralEditForm(referral) {
  return `
    <form class="form-grid dense-form referral-edit-form" data-referral-id="${escapeHtml(referral.id)}">
      ${input("clientName", "Patient name", "text", true, "", referral.clientName || "")}
      ${input("phone", "Mobile", "tel", false, "", referral.phone || "")}
      ${input("email", "Email", "email", false, "", referral.email || "")}
      ${input("address", "Address", "text", false, "full", referral.address || "")}
      ${input("suburb", "Suburb", "text", false, "", referral.suburb || "")}
      ${select("fundingType", "Funding", ["", "Home Care Package", "CHSP", "SAH", "NDIS", "Private", "Other"], referral.fundingType || "")}
      ${select("urgency", "Urgency", ["Low", "Medium", "High", "Urgent"], referral.urgency || "Medium")}
      ${select("status", "Status", state.data.referralStatuses, referral.status || "new")}
      ${select("assignedContractorId", "Assign practitioner", contractorOptions(true), referral.assignedContractorId || "")}
      ${input("referralSource", "Referral source / company", "text", false, "", referral.referralSource || "")}
      ${select("caseManagerId", "Case manager", caseManagerOptions(true), caseManagerSelectionValue(referral))}
      ${textarea("reasonForReferral", "Reason for referral", "full", referralReason(referral))}
      ${textarea("risks", "Risk alerts", "full", referral.risks || "")}
      <div class="form-actions full">
        <button type="submit">Save referral</button>
        <button type="button" class="secondary" data-action="referral-edit-cancel">Cancel</button>
      </div>
    </form>
  `;
}

function renderAppointmentCard(appointment) {
  const client = state.data.clients.find((item) => item.id === appointment.clientId) || {};
  const contractor = state.data.users.find((item) => item.id === appointment.contractorId) || {};
  const appointmentAddress = appointment.address || client.address || "";
  const practitionerWorkspace = state.data.currentUser.role === "contractor" || ownerViewingPractitioner();
  const activePractitionerId = currentCalendarPractitionerId();
  const canRebook = practitionerWorkspace && appointment.contractorId === activePractitionerId;
  const canRequestApproval = practitionerWorkspace && appointment.contractorId === activePractitionerId;
  const showTreatmentNote = appointmentRequiresTreatmentNote(appointment);
  const showReport = appointmentRequiresReport(appointment);
  const nextAppointment = nextAppointmentForClient(appointment);

  return `
    <article class="card appointment-card ${appointmentCardTone(appointment)}">
      <div class="section-heading">
        <h4>${patientNameButton(appointment.clientId, client.name || "Client")}</h4>
        ${statusPill(appointmentStatusLabel(appointment.status), appointmentStatusTone(appointment.status))}
      </div>
      ${renderAppointmentCompletionPills(appointment)}
      <div class="detail-list">
        <div><strong>Time</strong>${formatDateTime(appointment.startsAt)} - ${formatTime(appointment.endsAt)}</div>
        <div><strong>Address</strong>${escapeHtml(appointmentAddress)}</div>
        <div><strong>Contact</strong>${phoneLink(appointmentContactNumber(appointment), "No mobile recorded")}</div>
        <div><strong>Appointment type</strong>${escapeHtml(appointment.appointmentType || appointment.recurrence || appointment.serviceType)}</div>
        ${appointmentReasonDetailHtml(appointment, "Reason for referral")}
        ${clinikoAppointmentNoteDetailHtml(appointment, { compact: true })}
        <div><strong>Therapist</strong>${escapeHtml(contractor.name || "")}</div>
        <div><strong>Next appointment</strong>${renderNextAppointmentJump(nextAppointment)}</div>
      </div>
      <div class="actions">
        ${renderDirectionsLink(appointmentAddress)}
        ${showTreatmentNote ? `<button class="secondary" data-action="open-note" data-id="${appointment.id}">Note</button>` : ""}
        ${showReport ? `<button class="secondary" data-action="open-appointment-report" data-id="${appointment.id}">Report</button>` : ""}
        ${canRequestApproval ? `<button class="secondary" data-action="approval-needed" data-id="${appointment.id}" data-client-id="${appointment.clientId}">Approvals needed</button>` : ""}
        ${canRebook ? `<button data-action="rebook-appointment" data-id="${appointment.id}" data-client-id="${appointment.clientId}">Book another</button>` : ""}
        <button class="secondary archive-button" data-action="appointment-archive" data-id="${appointment.id}">Archive</button>
      </div>
      <div class="mini-actions">
        ${appointmentActionStatuses().map((status) => `<button class="${status === appointment.status ? "" : "secondary"}" data-action="appointment-status" data-id="${appointment.id}" data-status="${status}">${escapeHtml(appointmentStatusLabel(status))}</button>`).join("")}
      </div>
    </article>
  `;
}

function renderNextAppointmentJump(appointment, includePractitioner = false) {
  if (!appointment) return "None booked";

  const label = `${formatDateTime(appointment.startsAt)} - ${formatTime(appointment.endsAt)}${includePractitioner ? ` with ${userName(appointment.contractorId)}` : ""}`;
  return `
    <button type="button" class="text-link next-appointment-link" data-action="go-to-next-appointment" data-id="${escapeHtml(appointment.id)}" data-starts-at="${escapeHtml(appointment.startsAt)}">
      ${escapeHtml(label)}
    </button>
  `;
}

function patientNameButton(clientId, label) {
  return `
    <button type="button" class="patient-link" data-action="open-patient-file" data-client-id="${escapeHtml(clientId)}">
      ${escapeHtml(label || clientName(clientId))}
    </button>
  `;
}

function renderPatientFileModal() {
  if (!state.patientFileClientId) return "";

  const client = state.data.clients.find((item) => item.id === state.patientFileClientId);
  if (!client) return "";

  const appointments = patientAppointments(client.id);
  const upcoming = appointments
    .filter((appointment) => !patientAppointmentIsPrevious(appointment))
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  const previous = appointments
    .filter(patientAppointmentIsPrevious)
    .sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt));
  const completedNotes = patientCompletedNotes(client.id);
  const completedReports = patientCompletedReports(client.id);
  const view = ["details", "appointments", "notes", "reports"].includes(state.patientFileView) ? state.patientFileView : "details";

  return `
    <div class="appointment-modal-backdrop patient-file-backdrop" role="dialog" aria-modal="true" aria-labelledby="patient-file-title">
      <article class="appointment-modal patient-file-modal">
        <header class="appointment-modal-header patient-file-header">
          <div>
            <h3 id="patient-file-title">${escapeHtml(client.name || "Patient file")}</h3>
            <p>Patient file</p>
            <strong>${patientFileViewLabel(view)}</strong>
          </div>
          <button type="button" class="appointment-modal-close" data-action="patient-file-close">Close</button>
        </header>

        <div class="appointment-modal-body single-column patient-file-body">
          ${renderPatientFileNav(view, appointments.length, completedNotes.length, completedReports.length)}
          ${view === "appointments"
            ? renderPatientFileAppointments(upcoming, previous)
            : view === "reports"
            ? renderPatientFileReports(completedReports)
            : view === "notes"
            ? renderPatientFileNotes(completedNotes)
            : renderPatientFileDetails(client, appointments.length, completedNotes.length, completedReports.length)}
        </div>
      </article>
    </div>
  `;
}

function patientFileViewLabel(view) {
  return {
    details: "Patient details",
    appointments: "Appointments",
    notes: "Notes",
    reports: "Reports"
  }[view] || "Patient details";
}

function renderPatientFileNav(activeView, appointmentCount, noteCount, reportCount) {
  const items = [
    { id: "details", label: "Details" },
    { id: "appointments", label: "Appointments", count: appointmentCount },
    { id: "notes", label: "Notes", count: noteCount },
    { id: "reports", label: "Reports", count: reportCount }
  ];
  return `
    <nav class="patient-file-tabs" aria-label="Patient file sections">
      <label class="patient-file-select-control">
        <span>Section</span>
        <select data-action="patient-file-view-select" aria-label="Choose patient file section">
          ${items.map((item) => `
            <option value="${escapeHtml(item.id)}" ${activeView === item.id ? "selected" : ""}>
              ${escapeHtml(item.label)}${typeof item.count === "number" ? ` (${item.count})` : ""}
            </option>
          `).join("")}
        </select>
      </label>
      ${items.map((item) => `
        <button type="button" class="${activeView === item.id ? "active" : ""}" data-action="patient-file-view" data-view="${escapeHtml(item.id)}">
          ${escapeHtml(item.label)}
          ${typeof item.count === "number" ? `<span class="patient-file-tab-badge">${item.count}</span>` : ""}
        </button>
      `).join("")}
    </nav>
  `;
}

function renderPatientFileDetails(client, appointmentCount, noteCount, reportCount) {
  return `
    <section class="patient-file-section">
      <div class="section-heading"><h3>Patient details</h3><span>${escapeHtml(client.fundingType || "No funding type")}</span></div>
      <div class="detail-list">
        <div><strong>DOB</strong>${escapeHtml(client.dob || "Not recorded")}</div>
        <div><strong>Phone</strong>${escapeHtml(client.phone || "Not recorded")}</div>
        <div><strong>Email</strong>${escapeHtml(client.email || "Not recorded")}</div>
        <div><strong>Address</strong>${escapeHtml(client.address || "Not recorded")}</div>
        <div><strong>Emergency contact</strong>${escapeHtml(client.emergencyContact || "Not recorded")}</div>
        <div><strong>Diagnosis</strong>${escapeHtml(client.diagnosis || "Not recorded")}</div>
        <div><strong>Goals</strong>${escapeHtml(client.goals || "Not recorded")}</div>
        <div><strong>Risk alerts</strong>${escapeHtml(client.risks || "No alerts recorded")}</div>
      </div>
      <div class="patient-file-section-actions">
        <button type="button" class="secondary" data-action="patient-file-view" data-view="appointments">View appointments (${appointmentCount})</button>
        <button type="button" class="secondary" data-action="patient-file-view" data-view="notes">View notes (${noteCount})</button>
        <button type="button" class="secondary" data-action="patient-file-view" data-view="reports">View reports (${reportCount})</button>
      </div>
    </section>
  `;
}

function renderPatientFileAppointments(upcoming, previous) {
  return `
    <section class="patient-file-section">
      <div class="section-heading"><h3>Upcoming appointments</h3><span>${upcoming.length}</span></div>
      ${renderPatientAppointmentList(upcoming, "No upcoming appointments booked.")}
    </section>

    <section class="patient-file-section">
      <div class="section-heading"><h3>Previous appointments</h3><span>${previous.length}</span></div>
      ${renderPatientAppointmentList(previous, "No previous appointments recorded.")}
    </section>
  `;
}

function renderPatientFileNotes(completedWork) {
  return `
    <section class="patient-file-section">
      <div class="section-heading"><h3>Completed notes</h3><span>${completedWork.length}</span></div>
      ${renderPatientCompletedWorkList(completedWork, "No signed treatment notes yet.")}
    </section>
  `;
}

function renderPatientFileReports(completedReports) {
  return `
    <section class="patient-file-section">
      <div class="section-heading"><h3>Completed reports</h3><span>${completedReports.length}</span></div>
      ${renderPatientCompletedWorkList(completedReports, "No completed reports yet.")}
    </section>
  `;
}

function renderPatientAppointmentList(appointments, emptyText) {
  if (!appointments.length) return emptyState(emptyText);

  return `
    <div class="patient-file-list">
      ${appointments.map((appointment) => {
        const note = noteForAppointment(appointment.id);
        const report = exactReportForAppointment(appointment);
        const showTreatmentNote = appointmentRequiresTreatmentNote(appointment);
        const showReport = appointmentRequiresReport(appointment);
        const appointmentAddress = appointment.address || patientClientAddress(appointment.clientId) || "";
        return `
          <article class="patient-file-row">
            <div class="patient-file-row-main">
              <strong>${renderAppointmentDateJump(appointment)}</strong>
              <span>${escapeHtml(appointment.appointmentType || appointment.recurrence || appointment.serviceType || "Appointment")}</span>
            </div>
            <div class="meta-row">
              ${statusPill(appointmentStatusLabel(appointment.status), appointmentStatusTone(appointment.status))}
              ${renderAppointmentCompletionPills(appointment, false)}
            </div>
            <div class="detail-list compact">
              <div><strong>Practitioner</strong>${escapeHtml(userName(appointment.contractorId))}</div>
              <div><strong>Address</strong>${escapeHtml(appointmentAddress || "Not recorded")}</div>
              ${appointmentReasonDetailHtml(appointment)}
              ${clinikoAppointmentNoteDetailHtml(appointment, { compact: true })}
            </div>
            <div class="mini-actions">
              ${renderDirectionsLink(appointmentAddress)}
              ${showTreatmentNote ? `<button type="button" class="secondary" data-action="open-note" data-id="${escapeHtml(appointment.id)}">${note?.status === "signed" ? "View note" : note ? "Continue note" : "Start note"}</button>` : ""}
              ${showReport
                ? report
                  ? `<button type="button" class="secondary" data-action="open-report" data-id="${escapeHtml(report.id)}">${reportIsCompletedForAdmin(report) ? "View report" : "Continue report"}</button>`
                  : `<button type="button" class="secondary" data-action="open-appointment-report" data-id="${escapeHtml(appointment.id)}">Start report</button>`
                : ""}
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderAppointmentDateJump(appointment) {
  return `
    <button type="button" class="text-link appointment-date-link" data-action="go-to-calendar-appointment" data-id="${escapeHtml(appointment.id)}" data-starts-at="${escapeHtml(appointment.startsAt)}">
      ${escapeHtml(formatDateTime(appointment.startsAt))} - ${escapeHtml(formatTime(appointment.endsAt))}
    </button>
  `;
}

function renderPatientCompletedWorkList(items, emptyText = "No signed notes or completed reports yet.") {
  if (!items.length) return emptyState(emptyText);

  return `
    <div class="patient-file-list">
      ${items.map((item) => `
        <article class="patient-file-row">
          ${renderCompletedWorkRowContent(item)}
        </article>
      `).join("")}
    </div>
  `;
}

function renderCalendarEvent(appointment) {
  const readOnly = appointmentIsClinikoReadOnly(appointment);
  return `
    <button type="button" class="calendar-event ${appointmentEventTone(appointment)} ${readOnly ? "is-read-only" : ""}" style="--slot-span: ${appointmentSlotSpan(appointment)}" draggable="${readOnly ? "false" : "true"}" data-action="appointment-details" data-calendar-item-type="appointment" data-id="${escapeHtml(appointment.id)}" title="${escapeHtml(clientName(appointment.clientId))}" aria-label="Open appointment details for ${escapeHtml(clientName(appointment.clientId))}">
      <strong>${appointmentStatusEmoji(appointment)}${appointmentCompletionEmoji(appointment)}${escapeHtml(clientName(appointment.clientId))}</strong>
      <span>${formatTime(appointment.startsAt)}-${formatTime(appointment.endsAt)}</span>
      ${renderCalendarCompletionText(appointment)}
      ${readOnly ? "" : `<span class="calendar-resize-handle" data-resize-type="appointment" data-resize-id="${escapeHtml(appointment.id)}" aria-hidden="true"></span>`}
    </button>
  `;
}

function enabledClinikoLocations() {
  return (state.data?.clinikoLocations || []).filter((location) => location.enabled);
}

function enabledClinikoPractitioners() {
  return (state.data?.clinikoPractitioners || []).filter((practitioner) => practitioner.clinikoSyncEnabled);
}

function renderClinikoLocationsTable() {
  const locations = state.data?.clinikoLocations || [];
  if (!locations.length) {
    return emptyState("No Cliniko locations imported yet. Add a test API key, then press Sync now.");
  }

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Active</th><th>Location</th><th>Cliniko ID</th><th>Local ID</th><th>Timezone</th><th>Action</th></tr></thead>
        <tbody>
          ${locations.map((location) => `
            <tr>
              <td>${statusPill(location.enabled ? "enabled" : "disabled", location.enabled ? "blue" : "gold")}</td>
              <td><strong>${escapeHtml(location.displayName || location.name)}</strong><br><span>${escapeHtml(location.address || "No address recorded")}</span></td>
              <td>${escapeHtml(location.clinikoBusinessId)}</td>
              <td>${escapeHtml(location.id)}</td>
              <td>${escapeHtml(location.timeZone || "Not set")}</td>
              <td>
                <button type="button" class="${location.enabled ? "secondary" : ""}" data-action="cliniko-location-toggle" data-id="${escapeHtml(location.id)}" data-enabled="${location.enabled ? "false" : "true"}">
                  ${location.enabled ? "Disable" : "Enable for testing"}
                </button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderClinikoPractitionersTable() {
  const practitioners = state.data?.clinikoPractitioners || [];
  if (!practitioners.length) {
    return emptyState("No Cliniko practitioners imported yet. Add a test API key, then press Sync now.");
  }

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Active</th><th>Practitioner</th><th>Cliniko ID</th><th>Local ID</th><th>Action</th></tr></thead>
        <tbody>
          ${practitioners.map((practitioner) => `
            <tr>
              <td>${statusPill(practitioner.clinikoSyncEnabled ? "enabled" : "disabled", practitioner.clinikoSyncEnabled ? "blue" : "gold")}</td>
              <td><strong>${escapeHtml(practitioner.name || "Unnamed practitioner")}</strong><br><span>${escapeHtml(practitioner.email || "No email recorded")}</span></td>
              <td>${escapeHtml(practitioner.clinikoPractitionerId)}</td>
              <td>${escapeHtml(practitioner.id)}</td>
              <td>
                <button type="button" class="${practitioner.clinikoSyncEnabled ? "secondary" : ""}" data-action="cliniko-practitioner-toggle" data-id="${escapeHtml(practitioner.id)}" data-enabled="${practitioner.clinikoSyncEnabled ? "false" : "true"}">
                  ${practitioner.clinikoSyncEnabled ? "Disable" : "Enable for testing"}
                </button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAppointmentDetailModal() {
  if (!state.calendarAppointmentId) return "";

  const appointment = state.data.appointments.find((item) => item.id === state.calendarAppointmentId);
  if (!appointment) return "";

  const client = state.data.clients.find((item) => item.id === appointment.clientId) || {};
  const nextAppointment = nextAppointmentForClient(appointment);
  const durationMinutes = appointmentDurationMinutes(appointment);
  const isRescheduling = state.calendarAppointmentMode === "reschedule";
  const attendanceSaving = state.attendanceSavingAppointmentIds.has(appointment.id);
  const clinicalActions = appointmentClinicalActions(appointment);
  const showTreatmentNote = clinicalActions.showTreatmentNote;
  const showReport = clinicalActions.showReport;
  const readOnly = appointmentIsClinikoReadOnly(appointment);
  const appointmentAddress = appointment.address || client.address || "";
  const appointmentEmail = client.email || "";
  const practitionerWorkspace = state.data.currentUser?.role === "contractor" || ownerViewingPractitioner();
  const canSendRunningLate = practitionerWorkspace
    && appointment.contractorId === currentCalendarPractitionerId()
    && !["cancelled", "archived"].includes(appointment.status);
  const runningLateMinutes = Number(appointment.runningLateMinutes || 10);
  const runningLateMinuteOptions = [...new Set([runningLateMinutes, 5, 10, 15, 20, 30, 45, 60])].sort((a, b) => a - b);
  const lastUpdatedAt = appointment.clinikoUpdatedAt || appointment.updatedAt || appointment.createdAt || "";
  const runningLateForm = canSendRunningLate ? `
    <form class="running-late-form" id="running-late-form">
      <input type="hidden" name="appointmentId" value="${escapeHtml(appointment.id)}">
      <div class="running-late-header">
        <div>
          <span>Late notice</span>
        </div>
      </div>
      <div class="running-late-controls">
        <label class="running-late-minutes">
          <span>Min</span>
          <select name="minutesLate">
            ${runningLateMinuteOptions.map((minutes) => `
              <option value="${minutes}" ${minutes === runningLateMinutes ? "selected" : ""}>${minutes}</option>
            `).join("")}
          </select>
        </label>
        <button type="submit">Send</button>
      </div>
    </form>
  ` : "";

  return `
    <div class="appointment-modal-backdrop appointment-detail-backdrop" role="dialog" aria-modal="true" aria-labelledby="appointment-modal-title">
      <article class="appointment-modal appointment-detail-modal">
        <header class="appointment-modal-header">
          <div>
            <h3 id="appointment-modal-title">${escapeHtml(appointmentEventCaption(appointment))}</h3>
            <p>${escapeHtml(userName(appointment.contractorId))}</p>
            <strong>${formatAppointmentDate(appointment.startsAt)} at ${formatTime(appointment.startsAt)} for ${durationMinutes} minutes</strong>
          </div>
          <button type="button" class="appointment-modal-close" data-action="appointment-modal-close" aria-label="Close appointment details">&times;</button>
        </header>

        ${renderAppointmentClinikoNotePanel(appointment)}

        <div class="appointment-modal-body">
          <section class="appointment-modal-details">
            <div class="appointment-modal-name">
              <h4>${patientNameButton(appointment.clientId, client.name || clientName(appointment.clientId))}</h4>
              ${appointment.runningLateMinutes ? statusPill(`${appointment.runningLateMinutes} min late notice sent`, "gold") : ""}
            </div>
            ${renderAppointmentCompletionPills(appointment)}
            <div class="appointment-modal-contact">
              <span>${phoneLink(appointmentContactNumber(appointment), "No mobile recorded")}</span>
              ${appointmentEmail ? `<span>${escapeHtml(appointmentEmail)}</span>` : ""}
            </div>

            <div class="appointment-modal-list">
              <div><strong>Next appointment</strong>${renderNextAppointmentJump(nextAppointment, true)}</div>
              <div><strong>Address</strong>${escapeHtml(appointmentAddress || "No address recorded")}</div>
            </div>

            ${isRescheduling && !readOnly ? `
              <form class="appointment-reschedule-form" id="appointment-reschedule-form">
                <input type="hidden" name="appointmentId" value="${escapeHtml(appointment.id)}">
                <label>
                  Appointment time
                  <input name="startsAtLocal" type="datetime-local" value="${toDateTimeLocalBrisbane(new Date(appointment.startsAt))}" required>
                </label>
                <label>
                  Duration
                  <input name="durationMinutes" type="number" min="15" step="15" value="${durationMinutes}">
                </label>
                <label>
                  Appointment type
                  <select name="appointmentType">
                    ${appointmentTypeOptionsForEdit(appointment).map((type) => `<option value="${escapeHtml(type)}" ${type === (appointment.appointmentType || appointment.recurrence) ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}
                  </select>
                </label>
                <div class="form-actions full">
                  <button type="submit">Save changes</button>
                  <button type="button" class="secondary" data-action="appointment-details" data-id="${escapeHtml(appointment.id)}">Cancel</button>
                </div>
              </form>
            ` : ""}

            ${runningLateForm ? `<div class="appointment-modal-late-slot">${runningLateForm}</div>` : ""}
          </section>

          <aside class="appointment-modal-actions" aria-label="Appointment actions">
            ${showTreatmentNote || showReport ? `
              <div class="appointment-action-group appointment-action-main">
                <span class="appointment-action-label">Clinical</span>
                ${showTreatmentNote ? `<button type="button" class="appointment-primary-action" data-action="open-note" data-id="${escapeHtml(appointment.id)}">${escapeHtml(clinicalActions.noteLabel)}</button>` : ""}
                ${showReport ? `<button type="button" class="appointment-primary-action" data-action="open-appointment-report" data-id="${escapeHtml(appointment.id)}">${escapeHtml(clinicalActions.reportLabel)}</button>` : ""}
              </div>
            ` : ""}
            <div class="appointment-action-group appointment-action-attendance">
              <span class="appointment-action-label">Attendance</span>
              <div class="appointment-action-row">
                <button type="button" class="${appointmentStatusButtonClass(appointment, "completed")}" data-action="appointment-status" data-id="${escapeHtml(appointment.id)}" data-status="completed" ${attendanceSaving ? "disabled" : ""}>Arrived</button>
                <button type="button" class="${appointmentStatusButtonClass(appointment, "no-show")}" data-action="appointment-status" data-id="${escapeHtml(appointment.id)}" data-status="no-show" ${attendanceSaving ? "disabled" : ""}>Did not arrive</button>
              </div>
            </div>
            <div class="appointment-action-group appointment-action-travel">
              ${renderDirectionsLink(appointmentAddress)}
            </div>
            <details class="appointment-more-actions">
              <summary>More options</summary>
              <div>
                ${readOnly ? "" : `<button type="button" class="secondary" data-action="appointment-reschedule" data-id="${escapeHtml(appointment.id)}">Edit appointment</button>`}
                <button type="button" class="secondary" data-action="rebook-appointment" data-id="${escapeHtml(appointment.id)}" data-client-id="${escapeHtml(appointment.clientId)}">Book another</button>
                <button type="button" class="secondary archive-button" data-action="appointment-archive" data-id="${escapeHtml(appointment.id)}">Archive</button>
              </div>
            </details>
          </aside>
        </div>
        ${lastUpdatedAt ? `<footer class="appointment-modal-footer">Last updated ${escapeHtml(formatDateTime(lastUpdatedAt))}</footer>` : ""}
      </article>
    </div>
  `;
}

function renderCalendarBookingModal() {
  if (!state.calendarBookingStartLocal) return "";

  const clients = state.data.clients || [];
  const hasExistingPatients = clients.length > 0;
  const patientMode = hasExistingPatients ? state.calendarBookingPatientMode : "new";
  const selectedClient = clients.find((client) => client.id === state.calendarBookingClientId) || clients[0] || null;
  const practitioner = currentCalendarPractitioner();
  if (!practitioner) return "";
  const startLocal = state.calendarBookingStartLocal;
  const durationMinutes = 60;
  const endLocal = addMinutesToLocalDateTime(startLocal, durationMinutes);
  const startTime = timeSelectParts(startLocal);
  const endTime = timeSelectParts(endLocal);
  const isPast = localDateTimeIsPast(startLocal);
  const syncWarning = calendarBookingSyncWarning(practitioner);

  return `
    <div class="appointment-modal-backdrop calendar-booking-backdrop" role="dialog" aria-modal="true" aria-labelledby="calendar-booking-title">
      <article class="appointment-modal calendar-booking-modal">
        <form class="new-appointment-panel in-modal" id="calendar-booking-form">
          <header class="new-appointment-header">
            <div>
              <h3 id="calendar-booking-title">New appointment</h3>
              <p>${formatSelectedSlot(startLocal)}</p>
            </div>
            <button type="button" class="appointment-modal-close" data-action="calendar-booking-close" aria-label="Close new appointment">&times;</button>
          </header>

          <div class="new-appointment-fields">
            <input type="hidden" name="actorId" value="${escapeHtml(state.data.currentUser.id)}">
            <input type="hidden" name="contractorId" value="${escapeHtml(practitioner.id)}">
            <input type="hidden" name="serviceType" value="${escapeHtml(practitioner.discipline)}">
            <input type="hidden" name="bookingPatientMode" value="${escapeHtml(patientMode)}">
            ${patientMode === "existing" ? `<input type="hidden" name="address" value="${escapeHtml(selectedClient?.address || "")}">` : ""}
            <input type="hidden" name="durationMinutes" value="${durationMinutes}">

            <div class="new-appointment-row">
              <span>Practitioner</span>
              <div class="new-appointment-control static-control">${escapeHtml(practitioner.name)}</div>
            </div>

            ${syncWarning ? `
              <div class="new-appointment-row">
                <span></span>
                <div class="time-warning sync-warning">${escapeHtml(syncWarning)}</div>
              </div>
            ` : ""}

            <div class="new-appointment-row">
              <span>Type</span>
              <select name="appointmentType">
                ${calendarBookingTypeOptions(practitioner.discipline).map((type, index) => `<option value="${escapeHtml(type)}" ${index === 0 ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}
              </select>
            </div>

            <div class="new-appointment-row">
              <span>Patient</span>
              <div class="booking-patient-switch">
                ${hasExistingPatients ? `<button type="button" class="${patientMode === "existing" ? "active" : ""}" data-action="calendar-booking-patient-mode" data-mode="existing">Existing patient</button>` : ""}
                <button type="button" class="${patientMode === "new" ? "active" : ""}" data-action="calendar-booking-patient-mode" data-mode="new">Create new patient</button>
              </div>
            </div>

            ${patientMode === "existing" ? `
              <div class="new-appointment-row">
                <span>Existing patient</span>
                <select name="clientId" data-action="calendar-booking-client">
                  ${clients.map((client) => `<option value="${escapeHtml(client.id)}" ${client.id === selectedClient?.id ? "selected" : ""}>${escapeHtml(client.name)}</option>`).join("")}
                </select>
              </div>

              <div class="new-appointment-row">
                <span></span>
                <div class="address-box">
                  ${clientAddressLines(selectedClient).map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
                </div>
              </div>
            ` : `
              <div class="new-appointment-row">
                <span>Full name</span>
                <input name="fullName" type="text" required>
              </div>

              <div class="new-appointment-row">
                <span>Contact</span>
                <input name="contactNumber" type="tel" required>
              </div>

              <div class="new-appointment-row">
                <span>Address</span>
                <input name="address" type="text" required>
              </div>

              <div class="new-appointment-row">
                <span>Email</span>
                <input name="email" type="email">
              </div>

              <div class="new-appointment-row">
                <span>Funding</span>
                <select name="fundingType">
                  ${["Home Care Package", "CHSP", "SAH", "NDIS", "Private", "Other"].map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}
                </select>
              </div>

              <div class="new-appointment-row">
                <span>Referral reason</span>
                <textarea name="reasonForReferral"></textarea>
              </div>
            `}

            <div class="new-appointment-row">
              <span>Date</span>
              <input name="bookingDate" type="date" value="${escapeHtml(startLocal.split("T")[0])}" required>
            </div>

            <div class="new-appointment-row">
              <span>Time</span>
              <div class="time-selects">
                <div class="time-select-group">
                  ${timePartSelect("startHour", hourOptions(), startTime.hour)}
                  ${timePartSelect("startMinute", minuteOptions(), startTime.minute)}
                  ${timePartSelect("startPeriod", ["AM", "PM"], startTime.period)}
                </div>
                <span class="time-select-separator">to</span>
                <div class="time-select-group">
                  ${timePartSelect("endHour", hourOptions(), endTime.hour)}
                  ${timePartSelect("endMinute", minuteOptions(), endTime.minute)}
                  ${timePartSelect("endPeriod", ["AM", "PM"], endTime.period)}
                </div>
              </div>
            </div>

            ${isPast ? `
              <div class="new-appointment-row">
                <span></span>
                <div class="time-warning">The selected appointment time is in the past.</div>
              </div>
            ` : ""}

            <div class="new-appointment-row">
              <span>Repeat</span>
              ${renderRecurrenceOptions()}
            </div>

            <div class="new-appointment-row">
              <span>Note</span>
              <textarea name="rebookReason"></textarea>
            </div>

            <div class="new-appointment-row">
              <span></span>
              <button type="button" class="text-link" data-action="add-wait-list">Add to wait list</button>
            </div>

            <div class="new-appointment-row new-appointment-actions">
              <span></span>
              <div>
                <button type="submit">Create appointment</button>
                <button type="button" class="secondary" data-action="calendar-booking-close">Cancel</button>
              </div>
            </div>
          </div>
        </form>
      </article>
    </div>
  `;
}

function renderRecurrenceOptions(selected = "None") {
  const options = ["None", "Weekly", "Fortnightly", "Monthly"];
  return `
    <div class="repeat-options" role="radiogroup" aria-label="Repeat appointment">
      ${options.map((option) => `
        <label>
          <input type="radio" name="recurrence" value="${escapeHtml(option)}" ${option === selected ? "checked" : ""}>
          <span>${escapeHtml(option)}</span>
        </label>
      `).join("")}
    </div>
  `;
}

function renderUnavailableBlockModal() {
  const editingBlock = state.unavailableBlocks.find((block) => block.id === state.unavailableBlockId) || null;
  const startLocal = editingBlock?.startsAtLocal || state.unavailableBlockStartLocal;
  if (!startLocal) return "";

  const blockKind = editingBlock?.kind || state.unavailableBlockKind || "unavailable";
  const blockLabel = blockKindLabel(blockKind);
  const endLocal = editingBlock?.endsAtLocal || addMinutesToLocalDateTime(startLocal, 60);
  const startTime = timeSelectParts(startLocal);
  const endTime = timeSelectParts(endLocal);

  return `
    <div class="appointment-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="unavailable-block-title">
      <article class="appointment-modal calendar-booking-modal">
        <form class="new-appointment-panel in-modal" id="unavailable-block-form">
          <header class="new-appointment-header unavailable-header ${blockKind === "travel" ? "travel-header" : ""}">
            <div>
              <h3 id="unavailable-block-title">${escapeHtml(blockLabel)} block</h3>
              <p>${formatSelectedSlot(startLocal)}</p>
            </div>
            <button type="button" class="appointment-modal-close" data-action="unavailable-block-close">Close</button>
          </header>

          <div class="new-appointment-fields">
            <input type="hidden" name="id" value="${escapeHtml(editingBlock?.id || "")}">
            <input type="hidden" name="kind" value="${escapeHtml(blockKind)}">
            <div class="new-appointment-row">
              <span>Practitioner</span>
              <div class="new-appointment-control static-control">${escapeHtml(state.data.currentUser.name)}</div>
            </div>

            <div class="new-appointment-row">
              <span>Date</span>
              <input name="bookingDate" type="date" value="${escapeHtml(startLocal.split("T")[0])}" required>
            </div>

            <div class="new-appointment-row">
              <span>Time</span>
              <div class="time-selects">
                <div class="time-select-group">
                  ${timePartSelect("startHour", hourOptions(), startTime.hour)}
                  ${timePartSelect("startMinute", minuteOptions(), startTime.minute)}
                  ${timePartSelect("startPeriod", ["AM", "PM"], startTime.period)}
                </div>
                <span class="time-select-separator">to</span>
                <div class="time-select-group">
                  ${timePartSelect("endHour", hourOptions(), endTime.hour)}
                  ${timePartSelect("endMinute", minuteOptions(), endTime.minute)}
                  ${timePartSelect("endPeriod", ["AM", "PM"], endTime.period)}
                </div>
              </div>
            </div>

            <div class="new-appointment-row">
              <span>${blockKind === "travel" ? "Travel note" : "Reason"}</span>
              <textarea name="note">${escapeHtml(editingBlock?.note || "")}</textarea>
            </div>

            <div class="new-appointment-row new-appointment-actions">
              <span></span>
              <div>
                <button type="submit">Save ${escapeHtml(blockLabel.toLowerCase())} block</button>
                ${editingBlock ? `<button type="button" class="danger" data-action="delete-unavailable-block" data-id="${escapeHtml(editingBlock.id)}">Delete block</button>` : ""}
                <button type="button" class="secondary" data-action="unavailable-block-close">Cancel</button>
              </div>
            </div>
          </div>
        </form>
      </article>
    </div>
  `;
}

function renderReportReminderModal() {
  if (!state.reportReminderAppointmentId) return "";

  const appointment = state.data.appointments.find((item) => item.id === state.reportReminderAppointmentId);
  if (!appointment) return "";

  const client = state.data.clients.find((item) => item.id === appointment.clientId) || {};
  const message = reportReminderDefaultMessage(appointment);

  return `
    <div class="appointment-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="report-reminder-title">
      <article class="appointment-modal calendar-booking-modal">
        <form class="new-appointment-panel in-modal" id="report-reminder-form">
          <header class="new-appointment-header">
            <div>
              <h3 id="report-reminder-title">Message practitioner</h3>
              <p>Report reminder</p>
            </div>
            <button type="button" class="appointment-modal-close" data-action="report-reminder-close">Close</button>
          </header>

          <div class="new-appointment-fields">
            <input type="hidden" name="actorId" value="${escapeHtml(state.data.currentUser.id)}">
            <input type="hidden" name="appointmentId" value="${escapeHtml(appointment.id)}">
            <input type="hidden" name="contractorId" value="${escapeHtml(appointment.contractorId)}">
            <input type="hidden" name="clientId" value="${escapeHtml(appointment.clientId)}">

            <div class="new-appointment-row">
              <span>Practitioner</span>
              <div class="new-appointment-control static-control">${escapeHtml(userName(appointment.contractorId))}</div>
            </div>

            <div class="new-appointment-row">
              <span>Patient</span>
              <div class="new-appointment-control static-control">${escapeHtml(client.name || clientName(appointment.clientId))}</div>
            </div>

            <div class="new-appointment-row">
              <span>Report</span>
              <div class="new-appointment-control static-control">${escapeHtml(reportTypeForAppointment(appointment))}</div>
            </div>

            <div class="new-appointment-row">
              <span>Appointment</span>
              <div class="new-appointment-control static-control">${formatDateTime(appointment.startsAt)}</div>
            </div>

            <div class="new-appointment-row">
              <span>Message</span>
              <textarea name="message" required>${escapeHtml(message)}</textarea>
            </div>

            <div class="new-appointment-row new-appointment-actions">
              <span></span>
              <div>
                <button type="submit">Send reminder</button>
                <button type="button" class="secondary" data-action="report-reminder-close">Cancel</button>
              </div>
            </div>
          </div>
        </form>
      </article>
    </div>
  `;
}

function renderAppointmentAlert(appointment) {
  return `<article class="card compact">
    <h4>${patientNameButton(appointment.clientId, clientName(appointment.clientId))}</h4>
    <div class="meta-row">${statusPill("note incomplete", "gold")}${statusPill(appointment.serviceType, "blue")}</div>
    <p>${formatDateTime(appointment.startsAt)} with ${escapeHtml(userName(appointment.contractorId))}</p>
  </article>`;
}

function renderInboxItemCard(item) {
  const isClosed = ["resolved", "closed"].includes(item.status);
  const reportId = item.sourceType === "report_copy" ? item.sourceId : "";
  const report = reportId ? state.data.reports.find((entry) => entry.id === reportId) : null;
  const titleMarkup = reportId
    ? renderReportReviewDropdown(item, report)
    : `<h4>${escapeHtml(item.title)}</h4>`;
  const reportActions = reportId ? `
    <div class="actions">
      <button type="button" class="secondary" data-action="open-report" data-id="${escapeHtml(reportId)}">Open report</button>
      <a class="button secondary" href="/api/reports/${escapeHtml(reportId)}/pdf" target="_blank" rel="noreferrer">Download PDF</a>
    </div>
  ` : "";
  return `
    <article class="card compact inbox-card ${item.sourceType === "report_copy" ? "is-report-copy" : ""} ${isClosed ? "muted-card" : ""}">
      <div class="section-heading">
        ${titleMarkup}
        ${statusPill(inboxStatusLabel(item.status), inboxTone(item.status))}
      </div>
      <div class="meta-row">
        ${statusPill(inboxSourceLabel(item.sourceType), "blue")}
        ${statusPill(item.priority === "high" ? "high priority" : "normal priority", item.priority === "high" ? "coral" : "")}
      </div>
      <div class="detail-list">
        <div><strong>Client</strong>${escapeHtml(clientName(item.clientId))}</div>
        <div><strong>Practitioner</strong>${escapeHtml(item.contractorId ? userName(item.contractorId) : "Unassigned")}</div>
        <div><strong>Message</strong>${escapeHtml(item.message || "No message supplied.")}</div>
        <div><strong>Received</strong>${formatDateTime(item.createdAt)}</div>
      </div>
      ${reportActions}
      <div class="mini-actions">
        ${["new", "in_progress", "waiting", "resolved"].map((status) => `
          <button
            class="${item.status === status ? "" : "secondary"}"
            data-action="inbox-status"
            data-id="${item.id}"
            data-status="${status}"
          >${escapeHtml(inboxStatusLabel(status))}</button>
        `).join("")}
      </div>
    </article>
  `;
}

function renderOverviewReportReviewItem(item) {
  const reportId = item.sourceId || "";
  const report = reportId ? state.data.reports.find((entry) => entry.id === reportId) : null;
  return `
    <article class="overview-report-row">
      ${renderReportReviewDropdown(item, report)}
      <div class="overview-report-actions">
        <button type="button" class="secondary" data-action="open-report" data-id="${escapeHtml(reportId)}">Open report</button>
        <a class="button secondary" href="/api/reports/${escapeHtml(reportId)}/pdf" target="_blank" rel="noreferrer">Download PDF</a>
      </div>
    </article>
  `;
}

function renderReportReviewDropdown(item, report) {
  const reportId = report?.id || item.sourceId || "";
  const sentAt = report?.adminCopySentAt || report?.signedAt || report?.updatedAt || item.createdAt || report?.createdAt;
  const appointment = report?.appointmentId ? appointmentById(report.appointmentId) : null;
  const clientLabel = clientName(report?.clientId || item.clientId);
  const writerLabel = userName(report?.contractorId || item.contractorId);
  const reportType = report?.type || String(item.title || "").replace(/^Report for review:\s*/i, "") || "Report";
  const expanded = state.expandedReportReviewId === item.id;
  return `
    <div class="report-review-dropdown ${expanded ? "open" : ""}">
      <button
        type="button"
        class="report-review-toggle"
        data-action="toggle-report-review"
        data-id="${escapeHtml(item.id)}"
        aria-expanded="${expanded ? "true" : "false"}"
      >
        <span>
          <strong>${escapeHtml(clientLabel)}</strong>
          <em>${escapeHtml(reportType)}</em>
        </span>
        <small>View details</small>
      </button>
      ${expanded ? `
        <div class="report-review-dropdown-body">
          <div><strong>Written by</strong><span>${escapeHtml(writerLabel)}</span></div>
          <div><strong>Client</strong><span>${escapeHtml(clientLabel)}</span></div>
          <div><strong>Sent to admin</strong><span>${formatDateTime(sentAt)}</span></div>
          ${appointment ? `<div><strong>Appointment</strong><span>${formatDateTime(appointment.startsAt)} - ${formatTime(appointment.endsAt)}</span></div>` : ""}
          <button type="button" class="secondary" data-action="open-report" data-id="${escapeHtml(reportId)}">Open report</button>
        </div>
      ` : ""}
    </div>
  `;
}

function renderBookedNewPatientCard(referral) {
  const appointment = bookedAppointmentForReferral(referral);
  const client = state.data.clients.find((item) => item.id === referral.clientId) || {};
  return `
    <article class="card booked-patient-card">
      <div class="section-heading">
        <h4>${escapeHtml(referral.clientName || client.name || "Client")}</h4>
        ${statusPill("booked", "blue")}
      </div>
      <div class="meta-row">
        ${referral.referralSource ? statusPill(referral.referralSource) : ""}
      </div>
      <div class="detail-list compact">
        <div><strong>Appointment</strong>${appointment ? `${formatDateTime(appointment.startsAt)} - ${formatTime(appointment.endsAt)}` : "No appointment found"}</div>
        <div><strong>Practitioner</strong>${escapeHtml(appointment ? userName(appointment.contractorId) : userName(referral.assignedContractorId))}</div>
        <div><strong>Contact</strong>${escapeHtml(referral.phone || client.phone || "")}</div>
        <div><strong>Funding</strong>${escapeHtml(referral.fundingType || client.fundingType || "Not recorded")}</div>
      </div>
      ${appointment ? `
        <div class="actions">
          ${appointmentRequiresTreatmentNote(appointment)
            ? `<button data-action="open-note" data-id="${appointment.id}">Open note</button>`
            : appointmentRequiresReport(appointment)
            ? `<button data-action="open-appointment-report" data-id="${appointment.id}">Open report</button>`
            : ""}
        </div>
      ` : ""}
    </article>
  `;
}

function renderContractorCard(contractor) {
  const appointments = state.data.appointments.filter((appointment) => appointment.contractorId === contractor.id);
  const due = appointments.filter((appointment) => !appointment.notesComplete && appointment.status !== "cancelled").length;
  return `
    <article class="card">
      <h4>${escapeHtml(contractor.name)}</h4>
      <div class="meta-row">
        ${statusPill(contractor.discipline, "blue")}
        ${contractor.baseSuburb ? statusPill(contractor.baseSuburb) : ""}
      </div>
      <div class="detail-list">
        <div><strong>Bookings</strong>${appointments.length}</div>
        <div><strong>Incomplete notes</strong>${due}</div>
        <div><strong>Cliniko practitioner</strong>${escapeHtml(contractor.clinikoPractitionerId || "Not linked")}</div>
      </div>
    </article>
  `;
}

function renderClientCard(client) {
  const appointments = patientAppointments(client.id);
  const nextAppointment = appointments.find((appointment) => !patientAppointmentIsPrevious(appointment));
  const referral = state.data.referrals.find((item) => item.clientId === client.id);
  return `
    <article class="card client-record-card client-list-row">
      <div class="client-list-main">
        <div>
          <h4>${patientNameButton(client.id, client.name)}</h4>
          <span>${escapeHtml(client.phone || "No phone recorded")}</span>
        </div>
        <div class="meta-row">
          ${client.fundingType ? statusPill(client.fundingType, "blue") : ""}
          ${referral ? statusPill(referral.status) : ""}
        </div>
      </div>
      <div class="detail-list compact client-list-details">
        <div><strong>DOB</strong>${escapeHtml(client.dob || "Not recorded")}</div>
        <div><strong>Address</strong>${escapeHtml(client.address || "Not recorded")}</div>
        <div><strong>Next appointment</strong>${nextAppointment ? formatDateTime(nextAppointment.startsAt) : "None booked"}</div>
        <div><strong>Risk alerts</strong>${escapeHtml(client.risks || "No alerts.")}</div>
      </div>
      ${state.data.currentUser.role === "contractor" ? `
        <div class="actions">
          <button type="button" class="secondary" data-action="open-patient-file" data-client-id="${escapeHtml(client.id)}">Patient details</button>
          <button class="secondary" data-action="approval-needed" data-client-id="${client.id}">Approvals needed</button>
          <button data-action="rebook-client" data-client-id="${client.id}">Book another</button>
        </div>
      ` : ""}
    </article>
  `;
}

function renderClientRecordAppointmentList(appointments) {
  if (!appointments.length) return emptyState("No appointments recorded.");

  const sorted = [
    ...appointments.filter((appointment) => !patientAppointmentIsPrevious(appointment)).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)),
    ...appointments.filter(patientAppointmentIsPrevious).sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt))
  ];

  return `
    <div class="client-record-mini-list">
      ${sorted.map((appointment) => {
        const note = noteForAppointment(appointment.id);
        const report = exactReportForAppointment(appointment);
        const showTreatmentNote = appointmentRequiresTreatmentNote(appointment);
        const showReport = appointmentRequiresReport(appointment);
        const appointmentAddress = appointment.address || patientClientAddress(appointment.clientId) || "";
        return `
          <article class="client-record-row">
            <div class="client-record-row-main">
              <strong>${formatDateTime(appointment.startsAt)} - ${formatTime(appointment.endsAt)}</strong>
              <span>${escapeHtml(appointment.appointmentType || appointment.recurrence || appointment.serviceType || "Appointment")}</span>
            </div>
            <div class="meta-row">
              ${statusPill(appointmentStatusLabel(appointment.status), appointmentStatusTone(appointment.status))}
            </div>
            <div class="detail-list compact">
              <div><strong>Practitioner</strong>${escapeHtml(userName(appointment.contractorId))}</div>
              <div><strong>Address</strong>${escapeHtml(appointmentAddress || "Not recorded")}</div>
              ${appointmentReasonDetailHtml(appointment)}
              ${clinikoAppointmentNoteDetailHtml(appointment, { compact: true })}
            </div>
            <div class="mini-actions">
              ${renderDirectionsLink(appointmentAddress)}
              ${showTreatmentNote ? `<button type="button" class="secondary" data-action="open-note" data-id="${escapeHtml(appointment.id)}">${note?.status === "signed" ? "View note" : note ? "Continue note" : "Start note"}</button>` : ""}
              ${showReport
                ? report
                  ? `<button type="button" class="secondary" data-action="open-report" data-id="${escapeHtml(report.id)}">${reportIsCompletedForAdmin(report) ? "View report" : "Continue report"}</button>`
                  : `<button type="button" class="secondary" data-action="open-appointment-report" data-id="${escapeHtml(appointment.id)}">Start report</button>`
                : ""}
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderClientRecordWorkList(items) {
  if (!items.length) return emptyState("No completed notes or reports yet.");

  return `
    <div class="client-record-mini-list">
      ${items.map((item) => `
        <article class="client-record-row">
          ${renderCompletedWorkRowContent(item)}
        </article>
      `).join("")}
    </div>
  `;
}

function renderCompletedWorkRowContent(item) {
  if (item.kind === "note") {
    return `
      <div class="completed-note-row inline">
        <strong>${formatDateTime(item.appointmentDate || item.date)}</strong>
        <span>Notes completed</span>
        <button type="button" class="secondary" data-action="open-note" data-id="${escapeHtml(item.appointmentId)}">View note</button>
      </div>
    `;
  }

  return `
    <div class="client-record-row-main">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${formatDateTime(item.date)}</span>
    </div>
    <div class="meta-row">${statusPill(item.status, "blue")}</div>
    <div class="mini-actions">
      <button type="button" class="secondary" data-action="open-report" data-id="${escapeHtml(item.id)}">View report</button>
    </div>
  `;
}

function renderReportCard(report) {
  return `
    <article class="card">
      <div class="section-heading">
        <h4>${escapeHtml(report.type)}</h4>
        ${statusPill(reportStatusLabel(report.status), reportTone(report.status))}
      </div>
      <div class="detail-list">
        <div><strong>Client</strong>${escapeHtml(clientName(report.clientId))}</div>
        <div><strong>Therapist</strong>${escapeHtml(userName(report.contractorId))}</div>
        ${report.appointmentId ? `<div><strong>Appointment</strong>${escapeHtml(formatAppointmentLabel(report.appointmentId))}</div>` : ""}
        <div><strong>Summary</strong>${escapeHtml(report.summary || "No summary.")}</div>
        ${report.adminCopySentAt ? `<div><strong>Admin copy</strong>Sent ${formatDateTime(report.adminCopySentAt)}</div>` : ""}
        ${renderClinikoReportUploadStatus(report)}
      </div>
      <div class="actions">
        <button class="secondary" data-action="open-report" data-id="${report.id}">Open</button>
        <a class="button secondary" href="/api/reports/${report.id}/pdf" target="_blank" rel="noreferrer">Download PDF</a>
        ${renderClinikoReportUploadButton(report)}
      </div>
    </article>
  `;
}

function renderCompletedReportCard(report) {
  const appointment = state.data.appointments.find((item) => item.id === report.appointmentId);
  return `
    <article class="card completed-report-card">
      <div class="section-heading">
        <h4>${escapeHtml(report.type || "Completed report")}</h4>
        ${statusPill(reportStatusLabel(report.status), reportTone(report.status))}
      </div>
      <div class="detail-list">
        <div><strong>Client</strong>${patientNameButton(report.clientId, clientName(report.clientId))}</div>
        <div><strong>Practitioner</strong>${escapeHtml(userName(report.contractorId))}</div>
        <div><strong>Received</strong>${formatDateTime(report.adminCopySentAt || report.updatedAt || report.createdAt)}</div>
        ${appointment ? `<div><strong>Appointment</strong>${formatDateTime(appointment.startsAt)} - ${formatTime(appointment.endsAt)}</div>` : ""}
        <div><strong>Summary</strong>${escapeHtml(report.summary || "Ready for admin review.")}</div>
        ${renderClinikoReportUploadStatus(report)}
      </div>
      <div class="actions">
        <button data-action="open-report" data-id="${escapeHtml(report.id)}">Open report</button>
        <a class="button secondary" href="/api/reports/${escapeHtml(report.id)}/pdf" target="_blank" rel="noreferrer">Download PDF</a>
        ${renderClinikoReportUploadButton(report)}
      </div>
    </article>
  `;
}

function renderClinikoReportUploadStatus(report) {
  if (!isAdminReportUploadType(report.type)) return "";
  const enabled = state.data?.clinikoConfig?.reportUploadEnabled;
  const status = report.clinikoUploadStatus || (enabled ? "not uploaded" : "upload off");
  const tone = status === "synced" ? "blue" : status === "failed" ? "coral" : "gold";
  const detail = report.clinikoUploadStatus === "synced"
    ? `${report.clinikoAttachmentFilename || "Uploaded PDF"}${report.clinikoAttachmentProcessingCompleted ? "" : " (Cliniko processing)"}`
    : report.clinikoUploadError || (enabled ? "Will upload when signed or by admin retry." : "Enable report upload in environment variables to send PDFs to Cliniko.");
  return `<div><strong>Cliniko file</strong>${statusPill(status, tone)} <span>${escapeHtml(detail)}</span></div>`;
}

function renderClinikoReportUploadButton(report) {
  const enabled = state.data?.clinikoConfig?.reportUploadEnabled;
  if (!enabled || state.data.currentUser.role !== "admin") return "";
  if (!isAdminReportUploadType(report.type) || !["ready_for_admin", "final"].includes(report.status)) return "";
  if (report.clinikoUploadStatus === "synced" && report.clinikoAttachmentId && report.clinikoAttachmentProcessingCompleted) return "";
  const label = report.clinikoUploadStatus === "synced" && !report.clinikoAttachmentProcessingCompleted ? "Retry upload" : "Upload to Cliniko";
  return `<button type="button" class="secondary" data-action="upload-report-cliniko" data-id="${escapeHtml(report.id)}">${label}</button>`;
}

function isAdminReportUploadType(type) {
  return ["Initial Physiotherapy Assessment Report", "Equipment Trial Report"].includes(type);
}

function renderApprovalCard(request) {
  const isAdmin = state.data.currentUser.role === "admin";
  const pendingForPractitioner = !isAdmin && ["pending", "waiting"].includes(request.status);
  const tone = request.status === "approved" ? "" : request.status === "declined" ? "coral" : pendingForPractitioner ? "blue" : "gold";
  return `
    <article class="card compact approval-card">
      <div class="section-heading">
        <h4>${escapeHtml(request.approvalNeedType || request.type)}</h4>
        ${statusPill(approvalStatusLabel(request.status, { sentLabel: pendingForPractitioner }), tone)}
      </div>
      <div class="detail-list">
        <div><strong>Client</strong>${escapeHtml(clientName(request.clientId))}</div>
        <div><strong>Practitioner</strong>${escapeHtml(userName(request.contractorId))}</div>
        ${request.adminAction ? `<div><strong>Admin action</strong>${escapeHtml(request.adminAction)}</div>` : ""}
        <div><strong>Details</strong>${escapeHtml(request.details || "No message supplied.")}</div>
        ${request.resultMessage ? `<div><strong>Result</strong>${escapeHtml(request.resultMessage)}</div>` : ""}
      </div>
      ${isAdmin ? `
        <div class="mini-actions">
          <button data-action="approval-status" data-id="${request.id}" data-status="waiting" class="${request.status === "waiting" || request.status === "pending" ? "" : "secondary"}">Waiting</button>
          <button data-action="approval-status" data-id="${request.id}" data-status="approved" class="${request.status === "approved" ? "" : "secondary"}">Approved</button>
          <button data-action="approval-status" data-id="${request.id}" data-status="declined" class="${request.status === "declined" ? "" : "secondary"}">Declined</button>
        </div>
      ` : ""}
    </article>
  `;
}

function bindEvents() {
  document.querySelector("[data-action='brand-home']")?.addEventListener("click", () => {
    goToBrandHome();
    render();
    void markApprovalResultsSeenForCurrentTab();
  });

  document.querySelector("#global-search")?.addEventListener("input", (event) => {
    state.search = event.target.value;
    document.querySelector("#view").innerHTML = renderView();
    bindViewEvents();
  });

  document.querySelectorAll("[data-action='set-tab']").forEach((button) => {
    button.addEventListener("click", () => {
      setActiveTab(button.dataset.tab);
      render();
      void markApprovalResultsSeenForCurrentTab();
    });
  });

  document.querySelector("[data-action='toggle-tab-menu']")?.addEventListener("click", () => {
    state.tabMenuOpen = !state.tabMenuOpen;
    render();
  });

  document.querySelector("[data-action='tab-back']")?.addEventListener("click", () => {
    goBackToPreviousTab();
    render();
    void markApprovalResultsSeenForCurrentTab();
  });

  document.querySelectorAll("[data-action='tab-step']").forEach((button) => {
    button.addEventListener("click", () => {
      scrollTabList(Number(button.dataset.step || 1));
    });
  });

  document.querySelectorAll("[data-action='kpi-nav']").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.target;
      if (target === "notes-due") setActiveTab("notesDue");
      else if (target === "reports-due") setActiveTab("reportsDue");
      else if (target === "requests") setActiveTab("requests");
      else if (target === "inbox") setActiveTab("inbox");
      else if (target === "adminReports") setActiveTab("adminReports");
      else if (target === "messages") setActiveTab("messages");
      else setActiveTab("today");
      render();
      void markApprovalResultsSeenForCurrentTab();
    });
  });

  document.querySelector("[data-action='logout']")?.addEventListener("click", async () => {
    await fetchJson("/api/auth/logout", { method: "POST", body: {} });
    state.data = null;
    state.tab = "";
    state.search = "";
    state.loginError = "";
    state.forgotMessage = "";
    state.forgotMode = false;
    state.tabHistory = [];
    localStorage.removeItem("refine-active-tab");
    renderLogin();
  });

  bindViewEvents();
}

function goToBrandHome() {
  const user = state.data?.currentUser || {};
  const homeTab = user.role === "contractor" || ownerViewingPractitioner()
    ? "today"
    : currentTabs()[0]?.[0] || "today";
  setActiveTab(homeTab);
  state.search = "";
  state.tabHistory = [];
  state.calendarAppointmentId = "";
  state.calendarAppointmentMode = "details";
  state.patientFileClientId = "";
  state.patientFileView = "details";
  state.adminArchivedAppointmentId = "";
  state.caseManagerProfileId = "";
  state.expandedSignedNoteAppointmentId = "";
  state.expandedReportReviewId = "";
  closeCalendarBooking();
  closeUnavailableBlock();
  closeReportReminder();
  setCalendarDateKey(dateKeyFromParts(brisbaneParts(new Date())));
}

function bindLoginEvents() {
  document.querySelector("#login-form")?.addEventListener("submit", submitLogin);
  document.querySelector("#forgot-password-form")?.addEventListener("submit", submitForgotPassword);
  document.querySelectorAll("[data-action='login-destination']").forEach((button) => {
    button.addEventListener("click", () => {
      state.loginDestination = button.dataset.destination || "schedule";
      localStorage.setItem("refine-login-destination", state.loginDestination);
      renderLogin();
    });
  });
  document.querySelector("[data-action='forgot-password']")?.addEventListener("click", () => {
    state.forgotMode = true;
    state.loginError = "";
    state.forgotMessage = "";
    renderLogin();
  });
  document.querySelector("[data-action='back-to-login']")?.addEventListener("click", () => {
    state.forgotMode = false;
    state.loginError = "";
    state.forgotMessage = "";
    renderLogin();
  });
}

async function submitLogin(event) {
  event.preventDefault();
  const payload = formPayload(event.currentTarget);
  delete payload.loginDestination;
  state.loginLoading = true;
  state.loginError = "";
  state.forgotMessage = "";
  renderLogin();
  try {
    await fetchJson("/api/auth/login", { method: "POST", body: payload });
    state.loginLoading = false;
    state.tab = state.loginDestination === "handbook" ? "handbook" : "";
    if (state.loginDestination !== "handbook") {
      setCalendarDateKey(dateKeyFromParts(brisbaneParts(new Date())));
      state.calendarMonthPickerOpen = false;
    }
    state.tabHistory = [];
    await loadData();
    void syncClinikoForeground({ reason: "login", force: true, quiet: true });
  } catch (error) {
    state.loginLoading = false;
    state.loginError = error.message || "Could not sign in.";
    renderLogin();
  }
}

async function submitForgotPassword(event) {
  event.preventDefault();
  const payload = formPayload(event.currentTarget);
  state.loginLoading = true;
  state.loginError = "";
  state.forgotMessage = "";
  renderLogin();
  try {
    const result = await fetchJson("/api/auth/forgot-password", { method: "POST", body: payload });
    state.loginLoading = false;
    state.forgotMessage = result.message || "If the account exists, an admin can reset the password.";
    renderLogin();
  } catch (error) {
    state.loginLoading = false;
    state.loginError = error.message || "Could not request password reset.";
    renderLogin();
  }
}

function handleViewClick(event) {
  const rebookSlotButton = event.target.closest("[data-action='select-rebook-slot']");
  if (rebookSlotButton) {
    event.preventDefault();
    event.stopPropagation();
    state.rebookSelectedStartLocal = rebookSlotButton.dataset.startLocal;
    render();
    focusRebookForm();
    toast(`Selected ${formatSelectedSlot(rebookSlotButton.dataset.startLocal)}`);
    return;
  }

  const appointmentDetailButton = event.target.closest("[data-action='appointment-details']");
  if (appointmentDetailButton) {
    if (appointmentDetailButton.dataset.skipClick === "true") return;

    event.preventDefault();
    event.stopPropagation();
    state.calendarBookingStartLocal = "";
    closeUnavailableBlock();
    state.calendarAppointmentId = appointmentDetailButton.dataset.id;
    state.calendarAppointmentMode = "details";
    render();
    return;
  }

  const appointmentJumpButton = event.target.closest("[data-action='go-to-next-appointment'], [data-action='go-to-calendar-appointment']");
  if (!appointmentJumpButton) return;

  event.preventDefault();
  event.stopPropagation();
  goToAppointmentOnCalendar(appointmentJumpButton.dataset.id, appointmentJumpButton.dataset.startsAt);
}

function goToAppointmentOnCalendar(appointmentId, startsAtFallback = "") {
  const appointment = state.data.appointments.find((item) => item.id === appointmentId);
  const startsAt = appointment?.startsAt || startsAtFallback;
  if (!startsAt) return;

  setCalendarDateKey(brisbaneDateKey(startsAt));
  setActiveTab("today");
  state.calendarAppointmentId = appointment?.id || "";
  state.calendarAppointmentMode = "details";
  state.patientFileClientId = "";
  closeCalendarBooking();
  closeUnavailableBlock();
  render();
}

function bindViewEvents() {
  app.onclick = handleViewClick;

  document.querySelectorAll("[data-action='onboarding-section']").forEach((button) => {
    button.addEventListener("click", () => {
      setOnboardingSection(button.dataset.sectionId || "");
      render();
      scrollOnboardingContentToTop();
    });
  });

  document.querySelector("[data-action='onboarding-mobile-section']")?.addEventListener("change", (event) => {
    setOnboardingSection(event.currentTarget.value || "");
    render();
    scrollOnboardingContentToTop();
  });

  document.querySelector("[data-action='onboarding-complete']")?.addEventListener("click", (event) => {
    const sectionId = event.currentTarget.dataset.sectionId || currentOnboardingSection().id;
    const completed = onboardingCompletedIds();
    if (completed.has(sectionId)) completed.delete(sectionId);
    else completed.add(sectionId);
    setOnboardingCompletedIds(completed);
    render();
  });

  document.querySelector("[data-action='onboarding-next']")?.addEventListener("click", () => {
    setOnboardingSection(nextOnboardingSectionId());
    render();
    scrollOnboardingContentToTop();
  });

  document.querySelector("#user-create-form")?.addEventListener("submit", submitCreateUser);
  document.querySelectorAll(".user-edit-form").forEach((form) => {
    form.addEventListener("submit", submitEditUser);
  });
  document.querySelectorAll(".password-reset-form").forEach((form) => {
    form.addEventListener("submit", submitResetUserPassword);
  });

  document.querySelectorAll("[data-action='new-unavailable-block']").forEach((button) => {
    button.addEventListener("click", () => {
      state.calendarAppointmentId = "";
      closeCalendarBooking();
      state.unavailableBlockId = "";
      state.unavailableBlockKind = "unavailable";
      state.unavailableBlockStartLocal = defaultUnavailableStartLocal();
      render();
    });
  });

  document.querySelectorAll("[data-action='new-travel-block']").forEach((button) => {
    button.addEventListener("click", () => {
      state.calendarAppointmentId = "";
      closeCalendarBooking();
      state.unavailableBlockId = "";
      state.unavailableBlockKind = "travel";
      state.unavailableBlockStartLocal = defaultUnavailableStartLocal();
      render();
    });
  });

  document.querySelectorAll("[data-action='one-off-availability']").forEach((button) => {
    button.addEventListener("click", () => {
      toast("Use empty calendar slots to create one-off appointments");
    });
  });

  document.querySelectorAll("[data-action='open-unavailable-block']").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.skipClick === "true") return;
      state.calendarAppointmentId = "";
      closeCalendarBooking();
      state.unavailableBlockId = button.dataset.id;
      state.unavailableBlockKind = state.unavailableBlocks.find((block) => block.id === button.dataset.id)?.kind || "unavailable";
      state.unavailableBlockStartLocal = "";
      render();
    });
  });

  document.querySelectorAll("[data-action='synced-unavailable-block']").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.skipClick === "true") return;
      toast("This unavailable block is synced from Cliniko");
    });
  });

  document.querySelectorAll("[data-action='calendar-booking']").forEach((button) => {
    button.addEventListener("click", () => {
      state.calendarAppointmentId = "";
      state.calendarAppointmentMode = "details";
      closeUnavailableBlock();
      state.calendarBookingStartLocal = button.dataset.startLocal;
      state.calendarBookingClientId ||= state.data.clients[0]?.id || "";
      state.calendarBookingPatientMode = state.data.clients.length ? "existing" : "new";
      render();
      focusCalendarBookingField();
    });
  });

  document.querySelectorAll("[data-action='appointment-details']").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (button.dataset.skipClick === "true") return;
      event.preventDefault();
      event.stopPropagation();
      state.calendarBookingStartLocal = "";
      closeUnavailableBlock();
      state.calendarAppointmentId = button.dataset.id;
      state.calendarAppointmentMode = "details";
      render();
    });
  });

  document.querySelectorAll(".calendar-event, .calendar-unavailable-block").forEach((button) => {
    button.addEventListener("dragstart", (event) => {
      if (button.getAttribute("draggable") === "false") {
        event.preventDefault();
        return;
      }
      if (!event.dataTransfer) return;
      button.dataset.skipClick = "true";
      button.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", button.dataset.id);
      event.dataTransfer.setData("application/json", JSON.stringify({
        id: button.dataset.id,
        type: button.dataset.calendarItemType || "appointment"
      }));
    });

    button.addEventListener("dragend", () => {
      button.classList.remove("is-dragging");
      window.setTimeout(() => {
        button.dataset.skipClick = "";
      }, 0);
    });
  });

  document.querySelectorAll(".calendar-resize-handle").forEach((handle) => {
    handle.addEventListener("pointerdown", startCalendarResize);
  });

  document.querySelectorAll(".calendar-cell[data-calendar-day][data-calendar-slot]").forEach((cell) => {
    cell.addEventListener("dragover", (event) => {
      if (!event.dataTransfer) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (!slotHasUnavailableConflict(cell.dataset.calendarDay, Number(cell.dataset.calendarSlot), 15)) {
        cell.classList.add("is-drop-target");
      }
    });

    cell.addEventListener("dragleave", () => {
      cell.classList.remove("is-drop-target");
    });

    cell.addEventListener("drop", async (event) => {
      if (!event.dataTransfer) return;
      event.preventDefault();
      cell.classList.remove("is-drop-target");
      const dragData = calendarDragData(event.dataTransfer);
      if (!dragData.id) return;
      if (dragData.type === "unavailable") {
        moveUnavailableBlockToSlot(dragData.id, cell.dataset.calendarDay, Number(cell.dataset.calendarSlot));
        render();
        return;
      }
      await moveAppointmentToSlot(dragData.id, cell.dataset.calendarDay, Number(cell.dataset.calendarSlot));
    });
  });

  document.querySelector("[data-action='appointment-modal-close']")?.addEventListener("click", () => {
    state.calendarAppointmentId = "";
    state.calendarAppointmentMode = "details";
    render();
  });

  document.querySelectorAll("[data-action='calendar-booking-close']").forEach((button) => {
    button.addEventListener("click", () => {
      closeCalendarBooking();
      render();
    });
  });

  document.querySelectorAll("[data-action='unavailable-block-close']").forEach((button) => {
    button.addEventListener("click", () => {
      closeUnavailableBlock();
      render();
    });
  });

  document.querySelectorAll("[data-action='report-reminder-close']").forEach((button) => {
    button.addEventListener("click", () => {
      closeReportReminder();
      render();
    });
  });

  document.querySelectorAll("[data-action='open-patient-file']").forEach((button) => {
    button.addEventListener("click", () => {
      state.patientFileClientId = button.dataset.clientId || "";
      state.patientFileView = "details";
      render();
    });
  });

  document.querySelectorAll("[data-action='patient-file-view']").forEach((button) => {
    button.addEventListener("click", () => {
      state.patientFileView = button.dataset.view || "details";
      render();
    });
  });

  document.querySelector("[data-action='patient-file-view-select']")?.addEventListener("change", (event) => {
    state.patientFileView = event.target.value || "details";
    render();
  });

  document.querySelectorAll("[data-action='patient-file-close']").forEach((button) => {
    button.addEventListener("click", () => {
      state.patientFileClientId = "";
      state.patientFileView = "details";
      render();
    });
  });

  document.querySelectorAll("[data-action='case-manager-profile']").forEach((button) => {
    button.addEventListener("click", () => {
      state.caseManagerProfileId = button.dataset.id || "";
      render();
    });
  });

  document.querySelectorAll("[data-action='case-manager-profile-close']").forEach((button) => {
    button.addEventListener("click", () => {
      state.caseManagerProfileId = "";
      render();
    });
  });

  document.querySelectorAll("[data-action='delete-unavailable-block']").forEach((button) => {
    button.addEventListener("click", () => {
      deleteUnavailableBlock(button.dataset.id);
      toast("Unavailable block deleted");
      render();
    });
  });

  document.querySelectorAll(".appointment-modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (event) => {
      if (event.target !== event.currentTarget) return;
      state.calendarAppointmentId = "";
      state.calendarAppointmentMode = "details";
      state.patientFileClientId = "";
      state.patientFileView = "details";
      state.adminArchivedAppointmentId = "";
      state.caseManagerProfileId = "";
      closeCalendarBooking();
      closeUnavailableBlock();
      closeReportReminder();
      render();
    });
  });

  document.querySelectorAll("[data-action='appointment-reschedule']").forEach((button) => {
    button.addEventListener("click", () => {
      state.calendarAppointmentId = button.dataset.id;
      state.calendarAppointmentMode = "reschedule";
      render();
    });
  });

  document.querySelectorAll("[data-action='open-note']").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeAppointmentId = button.dataset.id;
      state.expandedSignedNoteAppointmentId = "";
      state.calendarAppointmentId = "";
      state.calendarAppointmentMode = "details";
      state.patientFileClientId = "";
      state.patientFileView = "details";
      closeCalendarBooking();
      closeUnavailableBlock();
      setActiveTab("notes");
      render();
    });
  });

  document.querySelectorAll("[data-action='open-appointment-report']").forEach((button) => {
    button.addEventListener("click", () => {
      const appointment = state.data.appointments.find((item) => item.id === button.dataset.id);
      if (!appointment) return;
      const existingReport = exactReportForAppointment(appointment);
      state.reportClientId = appointment.clientId;
      state.reportContractorId = appointment.contractorId;
      state.reportAppointmentId = appointment.id;
      state.reportType = existingReport?.type || (isEquipmentTrialReportAppointment(appointment) ? "Equipment Trial Report" : "Initial Physiotherapy Assessment Report");
      state.calendarAppointmentId = "";
      state.calendarAppointmentMode = "details";
      state.patientFileClientId = "";
      state.patientFileView = "details";
      closeCalendarBooking();
      closeUnavailableBlock();
      resetReportDraftState();
      setActiveTab("reports");
      render();
    });
  });

  document.querySelectorAll("[data-action='expand-signed-note']").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeAppointmentId = button.dataset.id;
      state.expandedSignedNoteAppointmentId = button.dataset.id;
      render();
    });
  });

  document.querySelectorAll("[data-action='appointment-status']").forEach((button) => {
    button.addEventListener("click", async () => {
      const appointment = state.data.appointments.find((item) => item.id === button.dataset.id);
      if (!appointment || state.attendanceSavingAppointmentIds.has(appointment.id)) return;
      const selectedStatus = button.dataset.status;
      const status = appointment?.status === selectedStatus ? "booked" : selectedStatus;
      const previous = { ...appointment };
      applyAppointmentLocalUpdate(appointment.id, {
        status,
        syncStatus: appointment.clinikoId ? "pending" : appointment.syncStatus,
        syncError: ""
      });
      state.attendanceSavingAppointmentIds.add(appointment.id);
      render();

      try {
        const saved = await fetchJson(`/api/appointments/${button.dataset.id}`, {
          method: "PATCH",
          body: { status, actorId: state.data.currentUser.id }
        });
        applyAppointmentLocalUpdate(appointment.id, saved);
        toast(appointmentStatusSyncMessage(saved, status));
      } catch (error) {
        applyAppointmentLocalUpdate(appointment.id, previous);
        toast(error.message || "Could not update attendance");
      } finally {
        state.attendanceSavingAppointmentIds.delete(appointment.id);
        render();
      }
    });
  });

  document.querySelector("#running-late-form")?.addEventListener("submit", submitRunningLate);

  document.querySelectorAll("[data-action='appointment-archive']").forEach((button) => {
    button.addEventListener("click", async () => {
      await fetchJson(`/api/appointments/${button.dataset.id}`, {
        method: "PATCH",
        body: { status: "archived", actorId: state.data.currentUser.id }
      });
      if (state.calendarAppointmentId === button.dataset.id) state.calendarAppointmentId = "";
      toast("Appointment archived");
      await loadData();
    });
  });

  document.querySelectorAll("[data-action='archived-appointment-open']").forEach((button) => {
    button.addEventListener("click", () => {
      state.adminArchivedAppointmentId = button.dataset.id || "";
      render();
    });
  });

  document.querySelectorAll("[data-action='archived-appointment-close']").forEach((button) => {
    button.addEventListener("click", () => {
      state.adminArchivedAppointmentId = "";
      render();
    });
  });

  document.querySelectorAll("[data-action='archived-appointment-delete']").forEach((button) => {
    button.addEventListener("click", () => {
      void deleteArchivedAppointmentHistory(button.dataset.id);
    });
  });

  document.querySelector("[data-action='archived-appointments-clear']")?.addEventListener("click", () => {
    void clearArchivedAppointmentHistory();
  });

  document.querySelectorAll("[data-action='calendar-mode']").forEach((button) => {
    button.addEventListener("click", () => {
      state.calendarMode = button.dataset.mode;
      localStorage.setItem("refine-calendar-mode", state.calendarMode);
      render();
    });
  });

  document.querySelector("[data-action='calendar-picker-toggle']")?.addEventListener("click", () => {
    state.calendarMonthPickerOpen = !state.calendarMonthPickerOpen;
    render();
  });

  document.querySelector("[data-action='calendar-picker-close']")?.addEventListener("click", () => {
    state.calendarMonthPickerOpen = false;
    render();
  });

  document.querySelectorAll("[data-action='calendar-date']").forEach((button) => {
    button.addEventListener("click", () => {
      setCalendarDateKey(button.dataset.date);
      state.calendarMonthPickerOpen = false;
      render();
    });
  });

  document.querySelectorAll("[data-action='calendar-shift']").forEach((button) => {
    button.addEventListener("click", () => {
      const direction = Number(button.dataset.direction || 1);
      const stepDays = effectiveCalendarMode() === "week" ? 7 : 1;
      setCalendarDateKey(addDaysToDateKey(selectedCalendarDateKey(), direction * stepDays));
      render();
    });
  });

  document.querySelector("[data-action='calendar-date-input']")?.addEventListener("change", (event) => {
    setCalendarDateKey(event.target.value);
    state.calendarMonthPickerOpen = false;
    render();
  });

  document.querySelector("[data-action='calendar-today']")?.addEventListener("click", () => {
    setCalendarDateKey(dateKeyFromParts(brisbaneParts(new Date())));
    state.calendarMonthOffset = 0;
    state.calendarMonthPickerOpen = false;
    localStorage.setItem("refine-calendar-month-offset", "0");
    render();
  });

  document.querySelectorAll("[data-action='calendar-skip']").forEach((button) => {
    button.addEventListener("click", () => {
      const amount = Number(button.dataset.amount || 0);
      const nextDate = button.dataset.unit === "months"
        ? addMonthsToDateKey(selectedCalendarDateKey(), amount)
        : addDaysToDateKey(selectedCalendarDateKey(), amount * 7);
      setCalendarDateKey(nextDate);
      render();
    });
  });

  document.querySelectorAll("[data-action='calendar-month-shift']").forEach((button) => {
    button.addEventListener("click", () => {
      shiftCalendarMonths(button.dataset.direction);
      render();
    });
  });

  document.querySelectorAll("[data-action='select-rebook-slot']").forEach((button) => {
    button.addEventListener("click", () => {
      state.rebookSelectedStartLocal = button.dataset.startLocal;
      render();
      focusRebookForm();
      toast(`Selected ${formatSelectedSlot(button.dataset.startLocal)}`);
    });
  });

  document.querySelectorAll("[data-action='rebook-appointment']").forEach((button) => {
    button.addEventListener("click", () => {
      state.rebookClientId = button.dataset.clientId;
      state.rebookFromAppointmentId = button.dataset.id;
      state.rebookSelectedStartLocal = "";
      state.calendarAppointmentId = "";
      state.calendarAppointmentMode = "details";
      closeCalendarBooking();
      closeUnavailableBlock();
      setActiveTab("rebook");
      render();
      focusRebookCalendar();
    });
  });

  document.querySelectorAll("[data-action='rebook-client']").forEach((button) => {
    button.addEventListener("click", () => {
      state.rebookClientId = button.dataset.clientId;
      state.rebookFromAppointmentId = "";
      state.rebookSelectedStartLocal = "";
      state.rebookStatusClientId = "";
      setActiveTab("rebook");
      render();
      focusRebookCalendar();
    });
  });

  document.querySelectorAll("[data-action='rebook-status']").forEach((button) => {
    button.addEventListener("click", () => {
      state.rebookStatusClientId = button.dataset.clientId;
      state.rebookClientId = "";
      state.rebookFromAppointmentId = "";
      state.rebookSelectedStartLocal = "";
      setActiveTab("rebook");
      render();
    });
  });

  document.querySelectorAll("[data-action='change-rebook-slot']").forEach((button) => {
    button.addEventListener("click", () => {
      state.rebookSelectedStartLocal = "";
      render();
      focusRebookCalendar();
    });
  });

  document.querySelectorAll("[data-action='cancel-rebook']").forEach((button) => {
    button.addEventListener("click", () => {
      state.rebookClientId = "";
      state.rebookFromAppointmentId = "";
      state.rebookSelectedStartLocal = "";
      render();
    });
  });

  document.querySelectorAll("[data-action='new-case']").forEach((button) => {
    button.addEventListener("click", () => {
      toast("Case can be added after the appointment is created");
    });
  });

  document.querySelectorAll("[data-action='add-wait-list']").forEach((button) => {
    button.addEventListener("click", () => {
      toast("Patient added to wait list");
    });
  });

  document.querySelectorAll("[data-action='approval-needed']").forEach((button) => {
    button.addEventListener("click", () => {
      state.approvalClientId = button.dataset.clientId || "";
      state.approvalAppointmentId = "";
      setActiveTab("requests");
      render();
      void markApprovalResultsSeenForCurrentTab();
    });
  });

  document.querySelectorAll("[data-action='approval-status']").forEach((button) => {
    button.addEventListener("click", async () => {
      await fetchJson(`/api/approval-requests/${button.dataset.id}`, {
        method: "PATCH",
        body: {
          status: button.dataset.status,
          actorId: state.data.currentUser.id,
          resultMessage: approvalResultMessage(button.dataset.status)
        }
      });
      toast("Approval result updated");
      await loadData();
    });
  });

  document.querySelectorAll("[data-action='inbox-status']").forEach((button) => {
    button.addEventListener("click", async () => {
      await fetchJson(`/api/inbox-items/${button.dataset.id}`, {
        method: "PATCH",
        body: {
          status: button.dataset.status,
          actorId: state.data.currentUser.id
        }
      });
      toast("Approval updated");
      await loadData();
    });
  });

  document.querySelectorAll("[data-action='notification-read']").forEach((card) => {
    const readUpdate = (event) => {
      event?.stopPropagation();
      markNotificationRead(card.dataset.id);
    };
    card.addEventListener("click", readUpdate);
    card.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      readUpdate();
    });
  });

  document.querySelectorAll("[data-action='report-case-manager']").forEach((button) => {
    button.addEventListener("click", async () => {
      const report = state.data.reports.find((item) => item.id === button.dataset.id);
      const sent = !report?.caseManagerSentAt;
      await fetchJson(`/api/reports/${button.dataset.id}/case-manager`, {
        method: "PATCH",
        body: { actorId: state.data.currentUser.id, sent }
      });
      toast(sent ? "Report marked as sent to case manager" : "Report unmarked as sent");
      await loadData();
    });
  });

  document.querySelectorAll("[data-action='message-thread']").forEach((button) => {
    button.addEventListener("click", () => {
      state.messageThreadUserId = button.dataset.userId;
      render();
      void markVisibleMessagesRead();
    });
  });

  document.querySelectorAll("[data-action='complete-report']").forEach((button) => {
    button.addEventListener("click", () => {
      const appointment = state.data.appointments.find((item) => item.id === button.dataset.id);
      if (!appointment) return;
      state.reportClientId = appointment.clientId;
      state.reportContractorId = appointment.contractorId;
      state.reportAppointmentId = appointment.id;
      state.reportType = reportTypeForAppointment(appointment);
      resetReportDraftState();
      setActiveTab("reports");
      render();
    });
  });

  document.querySelectorAll("[data-action='report-reminder']").forEach((button) => {
    button.addEventListener("click", () => {
      state.reportReminderAppointmentId = button.dataset.id;
      state.calendarAppointmentId = "";
      closeCalendarBooking();
      closeUnavailableBlock();
      render();
    });
  });

  document.querySelectorAll("[data-action='toggle-report-review']").forEach((button) => {
    button.addEventListener("click", () => {
      state.expandedReportReviewId = state.expandedReportReviewId === button.dataset.id ? "" : button.dataset.id;
      render();
    });
  });

  document.querySelectorAll("[data-action='open-report']").forEach((button) => {
    button.addEventListener("click", async () => {
      const reportId = button.dataset.id || "";
      const fallbackReport = state.data.reports.find((item) => item.id === reportId);
      if (!fallbackReport) return;
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Opening...";
      try {
        const report = await fetchJson(`/api/reports/${encodeURIComponent(reportId)}`);
        applyReportLocalUpdate(report);
        openReportForEditing(report);
      } catch (error) {
        toast(error.message || "Could not open report");
        openReportForEditing(fallbackReport);
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  });

  document.querySelectorAll("[data-action='assign-referral']").forEach((selectEl) => {
    selectEl.addEventListener("change", async () => {
      await fetchJson(`/api/referrals/${selectEl.dataset.id}`, {
        method: "PATCH",
        body: { assignedContractorId: selectEl.value, actorId: state.data.currentUser.id }
      });
      toast("Referral assigned");
      await loadData();
    });
  });

  document.querySelectorAll("[data-action='referral-status']").forEach((selectEl) => {
    selectEl.addEventListener("change", async () => {
      await fetchJson(`/api/referrals/${selectEl.dataset.id}`, {
        method: "PATCH",
        body: { status: selectEl.value, actorId: state.data.currentUser.id }
      });
      toast("Referral status updated");
      await loadData();
    });
  });

  document.querySelectorAll("[data-action='referral-edit']").forEach((button) => {
    button.addEventListener("click", () => {
      state.editReferralId = button.dataset.id || "";
      render();
    });
  });

  document.querySelectorAll("[data-action='referral-edit-cancel']").forEach((button) => {
    button.addEventListener("click", () => {
      state.editReferralId = "";
      render();
    });
  });

  document.querySelectorAll(".referral-edit-form").forEach((form) => {
    form.addEventListener("submit", submitReferralEdit);
  });

  document.querySelector("#note-appointment-select")?.addEventListener("change", (event) => {
    state.activeAppointmentId = event.target.value;
    state.expandedSignedNoteAppointmentId = "";
    render();
  });

  document.querySelector("#note-search")?.addEventListener("input", (event) => {
    state.noteSearch = event.target.value;
    const query = state.noteSearch.trim().toLowerCase();
    document.querySelectorAll("[data-note-search]").forEach((card) => {
      const isActive = card.dataset.activeNote === "true";
      card.hidden = Boolean(query) && !isActive && !(card.dataset.noteSearch || "").includes(query);
    });
  });

  document.querySelectorAll("[data-action='add-medical-alert']").forEach((button) => {
    button.addEventListener("click", () => {
      state.patientFileClientId = button.dataset.clientId || "";
      toast("Open patient details to add the alert");
      render();
    });
  });

  document.querySelectorAll("[data-action='print-note']").forEach((button) => {
    button.addEventListener("click", () => {
      window.print();
    });
  });

  document.querySelector("#outcome-measure-options")?.addEventListener("change", () => {
    const selected = selectedOutcomeMeasureInputs();
    state.noteOutcomeMeasures[outcomeMeasureContextKey()] = selected;
    const form = document.querySelector("#note-form");
    const reportForm = document.querySelector("#report-form");
    const fields = form ? fieldPayload(form) : reportForm ? fieldPayload(reportForm) : {};
    const customWrap = document.querySelector("#custom-outcome-wrap");
    if (customWrap) customWrap.classList.toggle("hidden", !selected.includes("other"));
    document.querySelectorAll(".outcome-measure-chip").forEach((chip) => {
      const input = chip.querySelector("input");
      chip.classList.toggle("selected", Boolean(input?.checked));
    });
    updateOutcomeMeasureOutputs(selected, fields);
    const selectedPill = document.querySelector(".clinical-block .section-heading .pill");
    if (selectedPill) selectedPill.textContent = `${selected.length} selected`;
  });

  document.querySelector("textarea[name='field_customOutcomeMeasures']")?.addEventListener("input", (event) => {
    const selected = selectedOutcomeMeasureInputs();
    const form = document.querySelector("#note-form");
    const reportForm = document.querySelector("#report-form");
    const fields = form ? fieldPayload(form) : reportForm ? fieldPayload(reportForm) : {};
    fields.customOutcomeMeasures = event.target.value;
    updateOutcomeMeasureOutputs(selected, fields);
  });

  document.querySelectorAll("[data-action='copy-previous-note']").forEach((button) => {
    button.addEventListener("click", () => {
      const form = button.closest("#note-form");
      const noteId = form?.querySelector("[data-previous-note-select]")?.value || "";
      const sourceNote = state.data.treatmentNotes.find((note) => note.id === noteId);
      if (!form || !sourceNote) return;

      copyTreatmentNoteFieldsIntoForm(form, sourceNote.fields || {});
      toast("Previous note copied into editable fields");
    });
  });

  document.querySelector("#rebook-client-select")?.addEventListener("change", (event) => {
    state.rebookClientId = event.target.value;
    state.rebookFromAppointmentId = "";
    state.rebookSelectedStartLocal = "";
    render();
  });

  document.querySelector("#approval-client-select")?.addEventListener("change", (event) => {
    state.approvalClientId = event.target.value;
    state.approvalAppointmentId = "";
    render();
  });

  document.querySelector("[data-action='calendar-booking-client']")?.addEventListener("change", (event) => {
    state.calendarBookingClientId = event.target.value;
    render();
  });

  document.querySelectorAll("#rebook-form input[name='bookingDate'], #rebook-form select[name='startHour'], #rebook-form select[name='startMinute'], #rebook-form select[name='startPeriod']").forEach((field) => {
    field.addEventListener("change", syncRebookEndTimeFromStart);
    field.addEventListener("input", syncRebookEndTimeFromStart);
  });

  document.querySelectorAll("[data-action='calendar-booking-patient-mode']").forEach((button) => {
    button.addEventListener("click", () => {
      state.calendarBookingPatientMode = button.dataset.mode;
      if (state.calendarBookingPatientMode === "existing") {
        state.calendarBookingClientId ||= state.data.clients[0]?.id || "";
      }
      render();
    });
  });

  document.querySelectorAll("[data-action='add-equipment-trial']").forEach((button) => {
    button.addEventListener("click", () => {
      preserveReportDraft();
      state.reportEquipmentTrialCount = Math.max(state.reportEquipmentTrialCount, document.querySelectorAll(".equipment-trial-block").length) + 1;
      render();
    });
  });

  document.querySelectorAll("[data-action='add-equipment-option']").forEach((button) => {
    button.addEventListener("click", () => {
      preserveReportDraft();
      const trialIndex = button.dataset.trialIndex;
      const currentCount = document.querySelectorAll(`.equipment-trial-block[data-trial-index="${trialIndex}"] input[name*="_option_"]`).length;
      state.reportEquipmentOptionCounts[trialIndex] = Math.max(state.reportEquipmentOptionCounts[trialIndex] || 0, currentCount) + 1;
      render();
    });
  });

  document.querySelectorAll("[data-action='delete-equipment-option']").forEach((button) => {
    button.addEventListener("click", () => {
      preserveReportDraft();
      const trialIndex = button.dataset.trialIndex;
      const optionIndex = Number(button.dataset.optionIndex);
      const currentCount = document.querySelectorAll(`.equipment-trial-block[data-trial-index="${trialIndex}"] input[name*="_option_"]`).length;
      removeEquipmentOptionFromDraft(trialIndex, optionIndex, currentCount);
      state.reportEquipmentOptionCounts[trialIndex] = Math.max(2, currentCount - 1);
      render();
    });
  });

  document.querySelector("[data-action='report-photo-input']")?.addEventListener("change", handleReportPhotoInput);

  document.querySelectorAll("[data-action='remove-report-photo']").forEach((button) => {
    button.addEventListener("click", () => {
      removeReportPhotoAttachment(Number(button.dataset.index));
    });
  });

  document.querySelectorAll("[data-action='report-photo-note']").forEach((textareaEl) => {
    textareaEl.addEventListener("input", () => {
      updateReportPhotoNote(Number(textareaEl.dataset.index), textareaEl.value);
    });
  });

  document.querySelectorAll("[data-action='ai-polish-section']").forEach((button) => {
    button.addEventListener("click", () => {
      void polishReportSectionWithAi(button);
    });
  });

  bindSignaturePad();
  document.querySelector("[data-action='signature-save']")?.addEventListener("click", () => {
    void saveSignatureFromPad();
  });
  document.querySelector("[data-action='signature-clear-canvas']")?.addEventListener("click", () => {
    clearSignaturePad();
  });
  document.querySelector("[data-action='signature-clear-saved']")?.addEventListener("click", (event) => {
    void clearSavedSignature(event.currentTarget);
  });

  document.querySelectorAll("input[name^='field_equipmentTrial_'][name$='_chosenModel'], input[name^='field_equipmentTrial_'][name$='_title']").forEach((inputEl) => {
    inputEl.addEventListener("input", updateEquipmentRecommendationsFromForm);
  });

  document.querySelector("#referral-form")?.addEventListener("submit", submitReferral);
  document.querySelector("#case-manager-form")?.addEventListener("submit", submitCaseManager);
  document.querySelectorAll("[data-case-manager-edit-form]").forEach((form) => {
    form.addEventListener("submit", submitCaseManagerEdit);
  });
  document.querySelectorAll("[data-action='assign-case-manager']").forEach((selectEl) => {
    selectEl.addEventListener("change", async () => {
      await fetchJson(`/api/clients/${encodeURIComponent(selectEl.dataset.clientId)}/case-manager`, {
        method: "PATCH",
        body: {
          caseManagerId: selectEl.value,
          actorId: state.data.currentUser.id
        }
      });
      toast(selectEl.value ? "Case manager assigned" : "Case manager removed");
      await loadData();
    });
  });
  document.querySelector("#reception-booking-form")?.addEventListener("submit", submitReceptionBooking);
  document.querySelector("#rebook-form")?.addEventListener("submit", submitRebook);
  document.querySelector("#rebook-status-form")?.addEventListener("submit", submitRebookStatus);
  document.querySelector("#appointment-reschedule-form")?.addEventListener("submit", submitAppointmentReschedule);
  document.querySelector("#calendar-booking-form")?.addEventListener("submit", submitCalendarBooking);
  document.querySelector("#unavailable-block-form")?.addEventListener("submit", submitUnavailableBlock);
  const noteForm = document.querySelector("#note-form");
  if (noteForm) {
    bindNoteSubmitModeTracking(noteForm);
    noteForm.addEventListener("submit", submitNote);
  }
  document.querySelector("#report-form")?.addEventListener("submit", submitReport);
  document.querySelector("#report-reminder-form")?.addEventListener("submit", submitReportReminder);
  document.querySelector("#message-form")?.addEventListener("submit", submitMessage);
  document.querySelector("#approval-form")?.addEventListener("submit", submitApproval);
  document.querySelector("#report-type-select")?.addEventListener("change", (event) => {
    state.reportType = event.target.value;
    resetReportDraftState();
    render();
  });

  document.querySelector("[data-action='sync-cliniko']")?.addEventListener("click", async () => {
    const result = await fetchJson("/api/cliniko/sync", { method: "POST", body: {} });
    toast(result.clinikoSync.message);
    await loadData();
  });

  document.querySelectorAll("[data-action='cliniko-location-toggle']").forEach((button) => {
    button.addEventListener("click", async () => {
      const enabled = button.dataset.enabled === "true";
      const result = await fetchJson(`/api/cliniko/locations/${button.dataset.id}`, {
        method: "PATCH",
        body: {
          enabled,
          actorId: state.data.currentUser.id
        }
      });
      toast(`${result.location.displayName || result.location.name} ${enabled ? "enabled" : "disabled"} for Cliniko sync`);
      await loadData();
    });
  });

  document.querySelectorAll("[data-action='cliniko-practitioner-toggle']").forEach((button) => {
    button.addEventListener("click", async () => {
      const enabled = button.dataset.enabled === "true";
      const result = await fetchJson(`/api/cliniko/practitioners/${button.dataset.id}`, {
        method: "PATCH",
        body: {
          enabled,
          actorId: state.data.currentUser.id
        }
      });
      toast(`${result.practitioner.name || "Practitioner"} ${enabled ? "enabled" : "disabled"} for Cliniko sync`);
      await loadData();
    });
  });

  document.querySelectorAll("[data-action='owner-practitioner']").forEach((control) => {
    control.addEventListener("change", () => {
      state.ownerPractitionerId = control.value;
      state.ownerView = control.value;
      localStorage.setItem("refine-owner-practitioner", state.ownerPractitionerId);
      localStorage.setItem("refine-owner-view", state.ownerView);
      state.tabHistory = [];
      state.calendarAppointmentId = "";
      closeCalendarBooking();
      closeUnavailableBlock();
      render();
    });
  });

  document.querySelector("[data-action='owner-view']")?.addEventListener("change", (event) => {
    state.ownerView = event.target.value || "admin";
    localStorage.setItem("refine-owner-view", state.ownerView);
    state.tabHistory = [];
    if (state.ownerView !== "admin") {
      state.ownerPractitionerId = state.ownerView;
      localStorage.setItem("refine-owner-practitioner", state.ownerPractitionerId);
      state.tab = "today";
    } else {
      state.tab = "overview";
    }
    localStorage.setItem("refine-active-tab", state.tab);
    state.calendarAppointmentId = "";
    state.approvalClientId = "";
    closeCalendarBooking();
    closeUnavailableBlock();
    render();
  });

  document.querySelector("[data-action='owner-admin-messages']")?.addEventListener("click", () => {
    state.ownerView = "admin";
    state.tab = "messages";
    localStorage.setItem("refine-owner-view", state.ownerView);
    localStorage.setItem("refine-active-tab", state.tab);
    state.tabHistory = [];
    state.calendarAppointmentId = "";
    closeCalendarBooking();
    closeUnavailableBlock();
    render();
  });

  document.querySelectorAll("[data-action='sync-error-retry']").forEach((button) => {
    button.addEventListener("click", async () => {
      const result = await fetchJson(`/api/sync-errors/${button.dataset.id}/retry`, {
        method: "POST",
        body: { actorId: state.data.currentUser.id }
      });
      toast(result.result?.status === "synced" ? "Sync retry completed" : "Sync retry recorded");
      await loadData();
    });
  });

  document.querySelectorAll("[data-action='upload-report-cliniko']").forEach((button) => {
    button.addEventListener("click", async () => {
      const result = await fetchJson(`/api/reports/${button.dataset.id}/cliniko-upload`, {
        method: "POST",
        body: { actorId: state.data.currentUser.id }
      });
      toast(result.upload?.status === "synced" ? "Report uploaded to Cliniko" : result.upload?.message || "Cliniko upload checked");
      await loadData();
    });
  });
}

async function submitReferral(event) {
  event.preventDefault();
  const payload = formPayload(event.currentTarget);
  payload.actorId = state.data.currentUser.id;
  await fetchJson("/api/referrals", { method: "POST", body: payload });
  event.currentTarget.reset();
  toast("Referral added");
  await loadData();
}

async function submitReferralEdit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formPayload(form);
  payload.actorId = state.data.currentUser.id;
  await fetchJson(`/api/referrals/${encodeURIComponent(form.dataset.referralId)}`, {
    method: "PATCH",
    body: payload
  });
  state.editReferralId = "";
  toast("Referral updated");
  await loadData();
}

async function submitReceptionBooking(event) {
  event.preventDefault();
  const payload = formPayload(event.currentTarget);
  const startsAt = new Date(payload.startsAtLocal);
  const durationMinutes = Number(payload.durationMinutes || 60);
  const contractor = state.data.contractors.find((item) => item.id === payload.contractorId);
  payload.startsAt = startsAt.toISOString();
  payload.endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000).toISOString();
  payload.serviceType = contractor?.discipline || serviceForAppointmentType(payload.appointmentType);
  delete payload.startsAtLocal;

  const result = await fetchJson("/api/reception-bookings", { method: "POST", body: payload });
  event.currentTarget.reset();
  toast(bookingSyncMessage(result.appointment, "Patient booked"));
  await loadData();
}

async function submitRebook(event) {
  event.preventDefault();
  const payload = formPayload(event.currentTarget);
  const times = appointmentTimesFromPayload(payload);
  if (slotHasUnavailableConflict(times.dayKey, times.slot, times.durationMinutes)) {
    toast("That time is marked unavailable");
    return;
  }
  payload.startsAt = times.startsAt;
  payload.endsAt = times.endsAt;
  payload.durationMinutes = times.durationMinutes;
  deleteAppointmentTimeFields(payload);

  const appointment = await fetchJson("/api/appointments", { method: "POST", body: payload });
  state.rebookFromAppointmentId = "";
  state.rebookClientId = "";
  state.rebookSelectedStartLocal = "";
  state.rebookStatusClientId = "";
  setActiveTab("today");
  setCalendarDateKey(brisbaneDateKey(appointment.startsAt));
  state.calendarAppointmentId = appointment.id;
  state.calendarAppointmentMode = "details";
  closeCalendarBooking();
  closeUnavailableBlock();
  toast(bookingSyncMessage(appointment, "Another appointment booked"));
  await loadData();
}

async function submitCalendarBooking(event) {
  event.preventDefault();
  const form = event.currentTarget;
  setFormSubmitting(form, true, "Creating...");

  try {
    const payload = formPayload(form);
    const selectedClient = state.data.clients.find((client) => client.id === payload.clientId);
    const times = appointmentTimesFromPayload(payload);
    const blockKind = blockKindFromAppointmentType(payload.appointmentType);
    const isNewPatient = payload.bookingPatientMode === "new";

    if (blockKind) {
      createCalendarBlockFromType(payload, times, blockKind);
      return;
    }

    if (slotHasUnavailableConflict(times.dayKey, times.slot, times.durationMinutes)) {
      toast("That time is marked unavailable");
      return;
    }

    const appointmentsForContractor = appointmentsForPractitioner(state.data.appointments, payload.contractorId);
    if (slotHasConflict(times.dayKey, times.slot, times.durationMinutes, appointmentsForContractor)) {
      toast("That time already has an appointment");
      return;
    }

    payload.startsAt = times.startsAt;
    payload.endsAt = times.endsAt;
    payload.durationMinutes = times.durationMinutes;
    const practitioner = state.data.contractors.find((contractor) => contractor.id === payload.contractorId) || currentCalendarPractitioner();
    payload.serviceType = practitioner?.discipline || state.data.currentUser.discipline;
    deleteAppointmentTimeFields(payload);
    delete payload.bookingPatientMode;

    if (isNewPatient) {
      delete payload.clientId;
      const result = await fetchJson("/api/reception-bookings", { method: "POST", body: payload });
      await finishCalendarBooking(result.appointment, "New patient booked");
      return;
    }

    payload.address = selectedClient?.address || payload.address || "";
    payload.contactNumber = selectedClient?.phone || "";

    const appointment = await fetchJson("/api/appointments", { method: "POST", body: payload });
    await finishCalendarBooking(appointment, "Appointment created");
  } catch (error) {
    toast(error.message || "Could not create appointment");
  } finally {
    setFormSubmitting(form, false);
  }
}

async function finishCalendarBooking(appointment, fallback) {
  closeCalendarBooking();
  closeUnavailableBlock();

  if (appointment?.startsAt) {
    setActiveTab("today");
    setCalendarDateKey(brisbaneDateKey(appointment.startsAt));
  }

  if (appointment?.id) {
    state.calendarAppointmentId = appointment.id;
    state.calendarAppointmentMode = "details";
  }

  toast(bookingSyncMessage(appointment, fallback));
  await loadData();
}

function bookingSyncMessage(appointment, fallback) {
  if (!appointment) return fallback;
  if (appointment.syncStatus === "synced" && appointment.clinikoId) return `${fallback} and synced to Cliniko`;
  if (appointment.syncStatus === "failed") return `${fallback}, but Cliniko sync failed${appointment.syncError ? `: ${appointment.syncError}` : ""}`;
  if (appointment.syncStatus === "pending") return `${fallback}; Cliniko sync pending`;
  return fallback;
}

function appointmentStatusSyncMessage(appointment, status) {
  const cleared = status === "booked";
  if (appointment?.syncStatus === "synced" && appointment.clinikoId) {
    return cleared ? "Attendance cleared in Cliniko" : "Attendance saved to Cliniko";
  }
  if (appointment?.syncStatus === "failed") {
    return appointment.syncError ? `Cliniko update failed: ${appointment.syncError}` : "Cliniko update failed";
  }
  return cleared ? "Appointment status cleared" : "Appointment updated";
}

function applyAppointmentLocalUpdate(appointmentId, updates = {}) {
  const appointment = state.data?.appointments?.find((item) => item.id === appointmentId);
  if (!appointment) return null;
  Object.assign(appointment, updates);
  return appointment;
}

function applyReportLocalUpdate(saved) {
  if (!state.data || !saved?.id) return;
  state.data.reports ||= [];
  const existingIndex = state.data.reports.findIndex((report) => report.id === saved.id);
  if (existingIndex >= 0) {
    state.data.reports[existingIndex] = { ...state.data.reports[existingIndex], ...saved };
  } else {
    state.data.reports.push(saved);
  }
}

function openReportForEditing(report) {
  if (!report) return;
  state.reportClientId = report.clientId;
  state.reportContractorId = report.contractorId;
  state.reportAppointmentId = report.appointmentId || "";
  state.reportType = report.type;
  state.patientFileClientId = "";
  resetReportDraftState();
  setActiveTab("reports");
  render();
}

function bindNoteSubmitModeTracking(form) {
  form.querySelectorAll("button[type='submit'][name='mode']").forEach((button) => {
    const rememberMode = () => {
      form.dataset.submitMode = button.value || "draft";
    };
    button.addEventListener("pointerdown", rememberMode);
    button.addEventListener("click", rememberMode);
  });
}

function setFormSubmitting(form, isSubmitting, label = "Saving...", activeButton = null) {
  if (!form) return;
  const buttons = [...form.querySelectorAll("button[type='submit']")];
  form.classList.toggle("is-submitting", isSubmitting);
  form.setAttribute("aria-busy", isSubmitting ? "true" : "false");
  if (isSubmitting) {
    form.dataset.submitting = "true";
  } else {
    delete form.dataset.submitting;
  }
  if (!buttons.length) return;

  if (isSubmitting) {
    const targetButton = activeButton && form.contains(activeButton) ? activeButton : buttons[0];
    buttons.forEach((button) => {
      button.dataset.originalText ||= button.textContent.trim();
      button.disabled = true;
      if (button === targetButton) button.textContent = label;
    });
    return;
  }

  buttons.forEach((button) => {
    button.disabled = false;
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  });
}

function focusCalendarBookingField() {
  window.setTimeout(() => {
    if (!window.matchMedia("(min-width: 720px)").matches) return;
    const form = document.querySelector("#calendar-booking-form");
    const target = form?.querySelector("select[name='clientId'], input[name='fullName'], select[name='appointmentType']");
    target?.focus({ preventScroll: true });
  }, 0);
}

function calendarBookingSyncWarning(practitioner) {
  const createModeEnabled = (state.data?.clinikoConfig?.mode || []).includes("appointment_create");
  if (!createModeEnabled) return "";
  if (practitioner?.clinikoSyncEnabled && practitioner?.clinikoPractitionerId) return "";
  return "This practitioner is not enabled for Cliniko sync, so this booking will not create in Cliniko. Switch to an enabled Cliniko practitioner or enable them in Admin > Cliniko.";
}

function createCalendarBlockFromType(payload, times, blockKind) {
  const practitionerId = payload.contractorId || currentCalendarPractitionerId();
  const appointmentsForContractor = state.data.appointments.filter((appointment) =>
    appointment.contractorId === practitionerId
  );

  if (slotHasConflict(times.dayKey, times.slot, times.durationMinutes, appointmentsForContractor)) {
    toast("That time already has an appointment");
    return;
  }

  if (slotHasUnavailableConflict(times.dayKey, times.slot, times.durationMinutes)) {
    toast("That time is already blocked");
    return;
  }

  const block = {
    id: `${blockKind}-${Date.now()}`,
    contractorId: practitionerId,
    kind: blockKind,
    startsAtLocal: times.startsAtLocal,
    endsAtLocal: times.endsAtLocal,
    note: payload.rebookReason || ""
  };

  state.unavailableBlocks = [...state.unavailableBlocks, block];
  saveUnavailableBlocks();
  closeCalendarBooking();
  toast(`${blockKindLabel(blockKind)} block created`);
  render();
}

async function submitUnavailableBlock(event) {
  event.preventDefault();
  const payload = formPayload(event.currentTarget);
  const times = appointmentTimesFromPayload({ ...payload, durationMinutes: 60 });
  const currentBlockId = payload.id || "";
  const currentBlock = state.unavailableBlocks.find((item) => item.id === currentBlockId);
  const practitionerId = currentBlock?.contractorId || currentCalendarPractitionerId();
  const appointmentsForContractor = state.data.appointments.filter((appointment) =>
    appointment.contractorId === practitionerId
  );

  if (slotHasConflict(times.dayKey, times.slot, times.durationMinutes, appointmentsForContractor)) {
    toast("That time already has an appointment");
    return;
  }

  if (slotHasUnavailableConflict(times.dayKey, times.slot, times.durationMinutes, currentBlockId)) {
    toast("That time is already unavailable");
    return;
  }

  const block = {
    id: currentBlockId || `unavailable-${Date.now()}`,
    contractorId: practitionerId,
    kind: payload.kind || state.unavailableBlockKind || "unavailable",
    startsAtLocal: times.startsAtLocal,
    endsAtLocal: times.endsAtLocal,
    note: payload.note || ""
  };

  state.unavailableBlocks = [
    ...state.unavailableBlocks.filter((item) => item.id !== block.id),
    block
  ];
  saveUnavailableBlocks();
  closeUnavailableBlock();
  toast(`${blockKindLabel(block.kind)} block saved`);
  render();
}

async function submitRebookStatus(event) {
  event.preventDefault();
  const payload = formPayload(event.currentTarget);
  await fetchJson("/api/rebook-statuses", { method: "POST", body: payload });
  state.rebookStatusClientId = "";
  toast("Status sent to reception");
  await loadData();
}

async function submitAppointmentReschedule(event) {
  event.preventDefault();
  const payload = formPayload(event.currentTarget);
  await moveAppointmentToLocalStart(payload.appointmentId, payload.startsAtLocal, Number(payload.durationMinutes || 60), payload.appointmentType || "");
}

async function submitNote(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.dataset.submitting === "true") return;

  const mode = event.submitter?.value || form.dataset.submitMode || "draft";
  const submitter = event.submitter || [...form.querySelectorAll("button[type='submit'][name='mode']")].find((button) => button.value === mode);
  const submittingLabel = mode === "signed" ? "Signing..." : mode === "offline" ? "Saving offline..." : "Saving...";
  setFormSubmitting(form, true, submittingLabel, submitter);

  try {
    const payload = formPayload(form);
    payload.fields = fieldPayload(form);
    payload.status = mode === "signed" ? "signed" : "draft";

    if (mode === "offline") {
      localStorage.setItem(offlineKey(payload.appointmentId), JSON.stringify({ ...payload, savedAt: new Date().toISOString() }));
      toast("Offline draft saved on this device");
      render();
      return;
    }

    const saved = await fetchJson("/api/treatment-notes", { method: "POST", body: payload });
    localStorage.removeItem(offlineKey(payload.appointmentId));
    applyTreatmentNoteLocalUpdate(saved);
    const appointment = state.data.appointments.find((item) => item.id === payload.appointmentId);
    const signedReportCopy = saved.status === "signed" && appointment && appointmentRequiresReport(appointment);
    if (saved.status === "signed") {
      state.expandedSignedNoteAppointmentId = "";
      state.activeAppointmentId = nextIncompleteNoteAppointmentId(payload.appointmentId);
    }
    toast(treatmentNoteSaveMessage(saved, signedReportCopy));
    await loadData();
  } catch (error) {
    toast(error.message || "Could not save treatment note");
  } finally {
    setFormSubmitting(form, false);
    delete form.dataset.submitMode;
  }
}

function treatmentNoteSaveMessage(saved, signedReportCopy) {
  if (saved.status !== "signed") return "Draft saved";
  if (saved.clinikoUploadStatus === "synced") return "Notes completed and uploaded to Cliniko files";
  if (saved.clinikoUploadStatus === "failed") return "Notes completed, but Cliniko file upload failed";
  if (saved.clinikoUploadStatus === "pending") return "Notes completed; Cliniko upload is running";
  if (signedReportCopy) return "Notes completed and report sent to admin";
  return "Notes completed";
}

function applyTreatmentNoteLocalUpdate(saved) {
  if (!state.data || !saved?.id) return;
  state.data.treatmentNotes ||= [];
  const existingIndex = state.data.treatmentNotes.findIndex((note) => note.id === saved.id);
  if (existingIndex >= 0) {
    state.data.treatmentNotes[existingIndex] = { ...state.data.treatmentNotes[existingIndex], ...saved };
  } else {
    state.data.treatmentNotes.push(saved);
  }

  const appointment = state.data.appointments.find((item) => item.id === saved.appointmentId);
  if (appointment && saved.status === "signed") {
    appointment.notesComplete = true;
    if (appointment.status !== "cancelled") appointment.status = "completed";
  }
}

async function submitReport(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const mode = event.submitter?.value || "draft";
  if (["ready_for_admin", "final"].includes(mode)) {
    await maybeSaveSignatureFromPad();
  }
  const payload = formPayload(form);
  payload.fields = fieldPayload(form);
  payload.status = mode;
  payload.actorId = state.data.currentUser.id;
  payload.submittedForAdminReview = mode === "ready_for_admin" && (state.data.currentUser.role === "contractor" || ownerViewingPractitioner());
  const saved = await fetchJson("/api/reports", { method: "POST", body: payload });
  applyReportLocalUpdate(saved);
  resetReportDraftState();
  const sentToAdmin = payload.submittedForAdminReview;
  if (sentToAdmin) {
    const appointment = state.data.appointments.find((item) => item.id === (saved.appointmentId || payload.appointmentId));
    if (appointment) {
      setCalendarDateKey(brisbaneDateKey(appointment.startsAt));
      state.calendarAppointmentId = appointment.id;
      state.calendarAppointmentMode = "details";
    } else {
      state.calendarAppointmentId = "";
    }
    setActiveTab("today");
    state.patientFileClientId = "";
    closeCalendarBooking();
    closeUnavailableBlock();
    await loadData();
    toast("Thank you for finalising your report!");
    return;
  }
  toast(mode === "ready_for_admin" ? "Report signed off and sent to admin" : `Report ${reportStatusLabel(mode).toLowerCase()} saved`);
  await loadData();
}

async function submitApproval(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector("button[type='submit']");
  const originalText = submitButton?.textContent || "Send to admin";
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Sending...";
  }

  try {
    const payload = formPayload(form);
    const result = await fetchJson("/api/approval-requests", { method: "POST", body: payload });
    state.approvalAppointmentId = "";
    state.approvalClientId = "";
    form.reset();
    toast(result.alreadySent ? "Approval already sent" : "Approval sent");
    await loadData();
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  }
}

async function submitReportReminder(event) {
  event.preventDefault();
  const payload = formPayload(event.currentTarget);
  await fetchJson("/api/report-reminders", { method: "POST", body: payload });
  closeReportReminder();
  toast("Reminder sent to practitioner");
  await loadData();
}

async function submitMessage(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector("button[type='submit']");
  const payload = formPayload(form);
  if (submitButton) submitButton.disabled = true;

  try {
    await fetchJson("/api/messages", { method: "POST", body: payload });
    form.reset();
    setActiveTab("messages");
    toast("Message sent");
    await loadData();
  } catch (error) {
    toast(error.message || "Could not send message");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function submitRunningLate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formPayload(form);
  const appointmentId = payload.appointmentId;
  const submitButton = form.querySelector("button[type='submit']");
  if (submitButton) submitButton.disabled = true;

  try {
    const result = await fetchJson(`/api/appointments/${encodeURIComponent(appointmentId)}/running-late`, {
      method: "POST",
      body: payload
    });
    toast(result.alert ? "Reception notified" : "Late notice recorded");
    await loadData();
  } catch (error) {
    toast(error.message);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function deleteArchivedAppointmentHistory(appointmentId) {
  const appointment = (state.data.archivedAppointments || []).find((item) => item.id === appointmentId);
  if (!appointment) return;
  const patient = clientName(appointment.clientId);
  const date = formatDateTime(appointment.startsAt);
  const confirmed = window.confirm(`Delete archived history for ${patient} on ${date}? This keeps the patient file, notes, and reports.`);
  if (!confirmed) return;

  try {
    await fetchJson(`/api/archived-appointments/${encodeURIComponent(appointmentId)}`, { method: "DELETE" });
    if (state.adminArchivedAppointmentId === appointmentId) state.adminArchivedAppointmentId = "";
    toast("Archived appointment history deleted");
    await loadData();
  } catch (error) {
    toast(error.message);
  }
}

async function clearArchivedAppointmentHistory() {
  const count = (state.data.archivedAppointments || []).length;
  if (!count) return;
  const confirmed = window.confirm(`Clear all ${count} archived appointment history record${count === 1 ? "" : "s"}? This keeps patient files, notes, and reports.`);
  if (!confirmed) return;

  try {
    const result = await fetchJson("/api/archived-appointments", { method: "DELETE" });
    state.adminArchivedAppointmentId = "";
    toast(`${result.deleted || 0} archived appointment history record${result.deleted === 1 ? "" : "s"} cleared`);
    await loadData();
  } catch (error) {
    toast(error.message);
  }
}

async function submitCaseManager(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const caseManager = await fetchJson("/api/case-managers", { method: "POST", body: formPayload(form) });
    form.reset();
    state.caseManagerProfileId = caseManager.id || "";
    toast("Case manager profile created");
    await loadData();
  } catch (error) {
    toast(error.message);
  }
}

async function submitCaseManagerEdit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await fetchJson(`/api/case-managers/${encodeURIComponent(form.dataset.id)}`, {
      method: "PATCH",
      body: formPayload(form)
    });
    toast("Case manager updated");
    await loadData();
  } catch (error) {
    toast(error.message);
  }
}

async function submitCreateUser(event) {
  event.preventDefault();
  const payload = formPayload(event.currentTarget);
  try {
    await fetchJson("/api/users", { method: "POST", body: normalizeUserFormPayload(payload) });
    event.currentTarget.reset();
    toast("User created");
    await loadData();
  } catch (error) {
    toast(error.message);
  }
}

async function submitEditUser(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = normalizeUserFormPayload(formPayload(form));
  try {
    await fetchJson(`/api/users/${encodeURIComponent(form.dataset.userId)}`, {
      method: "PATCH",
      body: payload
    });
    toast("User updated");
    await loadData();
  } catch (error) {
    toast(error.message);
  }
}

async function submitResetUserPassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formPayload(form);
  try {
    await fetchJson(`/api/users/${encodeURIComponent(form.dataset.userId)}/password`, {
      method: "POST",
      body: payload
    });
    form.reset();
    toast("Password reset");
    await loadData();
  } catch (error) {
    toast(error.message);
  }
}

function normalizeUserFormPayload(payload) {
  return {
    ...payload,
    isActive: payload.isActive !== "false"
  };
}

async function polishReportSectionWithAi(button) {
  const textareaEl = document.getElementById(button.dataset.target || "");
  if (!(textareaEl instanceof HTMLTextAreaElement)) return;

  const rawText = textareaEl.value.trim();
  if (!rawText) {
    toast("Add dot points first");
    textareaEl.focus();
    return;
  }

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "AI writing...";

  try {
    const form = textareaEl.closest("#report-form");
    const result = await fetchJson("/api/ai/report-section", {
      method: "POST",
      body: {
        text: rawText,
        sectionType: button.dataset.sectionType || textareaEl.dataset.aiSection || "",
        sectionLabel: button.dataset.sectionLabel || textareaEl.dataset.aiLabel || "",
        reportType: form?.querySelector("select[name='type']")?.value || state.reportType || ""
      }
    });
    textareaEl.value = result.text || rawText;
    textareaEl.dispatchEvent(new Event("input", { bubbles: true }));
    preserveReportDraft();
    toast("Polished with AI");
  } catch (error) {
    toast(error.message || "AI rewrite failed");
  } finally {
    button.disabled = false;
    button.textContent = originalText || "Polish with AI";
    textareaEl.focus();
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || payload.detail || "Request failed");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function loadUnavailableBlocks() {
  try {
    return JSON.parse(localStorage.getItem("refine-unavailable-blocks") || "[]");
  } catch {
    return [];
  }
}

function saveUnavailableBlocks() {
  localStorage.setItem("refine-unavailable-blocks", JSON.stringify(state.unavailableBlocks));
}

function formPayload(form) {
  const data = new FormData(form);
  return Object.fromEntries([...data.entries()].filter(([key]) => !key.startsWith("field_")));
}

function fieldPayload(form) {
  const data = new FormData(form);
  return [...data.entries()].reduce((fields, [key, value]) => {
    if (key.startsWith("field_")) {
      const fieldKey = key.replace("field_", "");
      if (Object.hasOwn(fields, fieldKey)) {
        fields[fieldKey] = Array.isArray(fields[fieldKey])
          ? [...fields[fieldKey], value]
          : [fields[fieldKey], value];
      } else {
        fields[fieldKey] = value;
      }
    }
    return fields;
  }, {});
}

function reportPhotoAttachmentsFromFields(fields = {}) {
  const raw = fields.photoAttachments;
  let parsed = [];

  if (Array.isArray(raw)) {
    parsed = raw;
  } else if (typeof raw === "string" && raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = [];
    }
  }

  return parsed
    .filter((photo) => photo && typeof photo === "object")
    .slice(0, REPORT_PHOTO_LIMIT)
    .map((photo, index) => {
      const dataUrl = String(photo.dataUrl || "");
      const fileId = String(photo.fileId || "").trim();
      const url = String(photo.url || "").trim();
      const hasInlineImage = dataUrl.startsWith("data:image/jpeg;base64,") && dataUrl.length < REPORT_PHOTO_MAX_DATA_URL_LENGTH;
      const hasStoredImage = Boolean(fileId || url.startsWith("/api/report-photos/"));
      if (!hasInlineImage && !hasStoredImage) return null;
      return {
        id: String(photo.id || `photo-${index + 1}`),
        order: index + 1,
        name: String(photo.name || `Photo ${index + 1}`).slice(0, 80),
        mimeType: "image/jpeg",
        width: Number(photo.width || 0),
        height: Number(photo.height || 0),
        dataUrl: hasInlineImage ? dataUrl : "",
        fileId,
        url: url || (fileId ? `/api/report-photos/${encodeURIComponent(fileId)}` : ""),
        note: String(photo.note || "").slice(0, 600),
        addedAt: photo.addedAt || ""
      };
    })
    .filter(Boolean);
}

function reportPhotoImageSrc(photo = {}) {
  return photo.dataUrl || photo.url || "";
}

function reportPhotoSizeLabel(photo) {
  const width = Number(photo.width || 0);
  const height = Number(photo.height || 0);
  if (width && height) return `${width} x ${height}px`;
  return "Compressed photo";
}

async function handleReportPhotoInput(event) {
  const inputEl = event.currentTarget;
  const form = inputEl.closest("#report-form");
  const hiddenInput = form?.querySelector("input[name='field_photoAttachments']");
  if (!form || !hiddenInput) return;

  const existingPhotos = reportPhotoAttachmentsFromFields({ photoAttachments: hiddenInput.value });
  const remainingSlots = REPORT_PHOTO_LIMIT - existingPhotos.length;
  const files = [...(inputEl.files || [])].slice(0, Math.max(0, remainingSlots));

  if (!remainingSlots) {
    toast("Photo limit reached");
    inputEl.value = "";
    return;
  }

  if (!files.length) return;

  try {
    const newPhotos = [];
    for (const file of files) {
      newPhotos.push(await compressReportPhotoFile(file));
    }

    hiddenInput.value = JSON.stringify([...existingPhotos, ...newPhotos]);
    preserveReportDraft();
    toast(`${newPhotos.length} photo${newPhotos.length === 1 ? "" : "s"} attached to the report PDF`);
    render();
  } catch (error) {
    toast(error.message || "Could not attach photo");
  } finally {
    inputEl.value = "";
  }
}

function removeReportPhotoAttachment(index) {
  const form = document.querySelector("#report-form");
  const hiddenInput = form?.querySelector("input[name='field_photoAttachments']");
  if (!form || !hiddenInput) return;

  const photos = reportPhotoAttachmentsFromFields({ photoAttachments: hiddenInput.value });
  photos.splice(index, 1);
  hiddenInput.value = JSON.stringify(photos);
  preserveReportDraft();
  toast("Photo removed from report PDF");
  render();
}

function updateReportPhotoNote(index, note) {
  const form = document.querySelector("#report-form");
  const hiddenInput = form?.querySelector("input[name='field_photoAttachments']");
  if (!form || !hiddenInput) return;

  const photos = reportPhotoAttachmentsFromFields({ photoAttachments: hiddenInput.value });
  if (!photos[index]) return;
  photos[index].note = String(note || "").slice(0, 600);
  hiddenInput.value = JSON.stringify(photos);
  preserveReportDraft();
}

function bindSignaturePad() {
  const canvas = document.querySelector("#signature-pad");
  if (!canvas) return;

  const context = canvas.getContext("2d");
  context.lineWidth = 2.4;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "#1b1b1b";

  let drawing = false;
  let previousPoint = null;

  const pointForEvent = (event) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  };

  const begin = (event) => {
    event.preventDefault();
    drawing = true;
    previousPoint = pointForEvent(event);
    canvas.setPointerCapture?.(event.pointerId);
  };

  const draw = (event) => {
    if (!drawing || !previousPoint) return;
    event.preventDefault();
    const nextPoint = pointForEvent(event);
    context.beginPath();
    context.moveTo(previousPoint.x, previousPoint.y);
    context.lineTo(nextPoint.x, nextPoint.y);
    context.stroke();
    previousPoint = nextPoint;
    canvas.dataset.hasInk = "true";
  };

  const end = (event) => {
    if (!drawing) return;
    event.preventDefault();
    drawing = false;
    previousPoint = null;
  };

  canvas.addEventListener("pointerdown", begin);
  canvas.addEventListener("pointermove", draw);
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("pointerleave", end);
}

function clearSignaturePad() {
  const canvas = document.querySelector("#signature-pad");
  if (!canvas) return;
  canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  canvas.dataset.hasInk = "";
}

async function maybeSaveSignatureFromPad() {
  const canvas = document.querySelector("#signature-pad");
  if (!canvas || canvas.dataset.hasInk !== "true") return;
  await saveSignatureFromPad({ quiet: true });
}

async function saveSignatureFromPad(options = {}) {
  const canvas = document.querySelector("#signature-pad");
  if (!canvas || canvas.dataset.hasInk !== "true") {
    if (!options.quiet) toast("Draw your signature first");
    return;
  }

  try {
    const signature = signaturePadDataUrl(canvas);
    const result = await fetchJson(signatureEndpointForUser(canvas.dataset.userId), {
      method: "PATCH",
      body: signature
    });
    applyUpdatedUser(result.user);
    clearSignaturePad();
    if (!options.quiet) {
      toast("Signature saved");
      render();
    }
  } catch (error) {
    toast(error.message || "Could not save signature");
    throw error;
  }
}

async function clearSavedSignature(button = null) {
  try {
    const canvas = document.querySelector("#signature-pad");
    const targetUserId = button?.dataset?.userId || canvas?.dataset?.userId || state.data.currentUser.id;
    const result = await fetchJson(signatureEndpointForUser(targetUserId), {
      method: "PATCH",
      body: { clear: true }
    });
    applyUpdatedUser(result.user);
    clearSignaturePad();
    toast("Saved signature removed");
    render();
  } catch (error) {
    toast(error.message || "Could not remove signature");
  }
}

function signaturePadDataUrl(canvas) {
  const output = document.createElement("canvas");
  output.width = canvas.width;
  output.height = canvas.height;
  const context = output.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(canvas, 0, 0);
  return {
    signatureDataUrl: output.toDataURL("image/jpeg", 0.82),
    width: output.width,
    height: output.height
  };
}

function signatureEndpointForUser(userId) {
  const targetUserId = String(userId || state.data.currentUser.id || "");
  return targetUserId && targetUserId !== state.data.currentUser.id
    ? `/api/users/${encodeURIComponent(targetUserId)}/signature`
    : "/api/users/me/signature";
}

function applyUpdatedUser(user) {
  if (!user || !state.data) return;
  if (state.data.currentUser?.id === user.id) {
    state.data.currentUser = { ...state.data.currentUser, ...user };
  }
  state.data.users = (state.data.users || []).map((item) => item.id === user.id ? { ...item, ...user } : item);
  state.data.contractors = (state.data.contractors || []).map((item) => item.id === user.id ? { ...item, ...user } : item);
}

async function compressReportPhotoFile(file) {
  if (!file || (file.type && !String(file.type || "").startsWith("image/"))) {
    throw new Error("Please choose an image file");
  }

  const sourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageFromDataUrl(sourceDataUrl);
  const width = image.naturalWidth || image.width || 1;
  const height = image.naturalHeight || image.height || 1;
  const scale = Math.min(1, REPORT_PHOTO_MAX_EDGE / Math.max(width, height));
  const outputWidth = Math.max(1, Math.round(width * scale));
  const outputHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = outputWidth;
  canvas.height = outputHeight;
  context.drawImage(image, 0, 0, outputWidth, outputHeight);

  const dataUrl = canvas.toDataURL("image/jpeg", REPORT_PHOTO_QUALITY);
  if (dataUrl.length > REPORT_PHOTO_MAX_DATA_URL_LENGTH) {
    throw new Error("That photo is too large. Please retake it or choose a smaller image.");
  }

  return {
    id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name || `Report photo ${new Date().toLocaleDateString("en-AU")}`,
    mimeType: "image/jpeg",
    width: outputWidth,
    height: outputHeight,
    dataUrl,
    note: "",
    addedAt: new Date().toISOString()
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the photo"));
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("This image format could not be attached. Please use a camera photo or JPG/PNG image."));
    image.src = dataUrl;
  });
}

function copyTreatmentNoteFieldsIntoForm(form, fields) {
  if (!form || !fields) return;

  if (Object.hasOwn(fields, "outcomeMeasures")) {
    setFormControlValue(form.elements.namedItem("field_outcomeMeasures"), fields.outcomeMeasures);
  }

  for (const [key, value] of Object.entries(fields)) {
    setFormControlValue(form.elements.namedItem(`field_${key}`), value);
  }

  const outcomeSelect = form.querySelector("#outcome-measure-select");
  if (outcomeSelect) {
    updateOutcomeMeasureOutputs([...outcomeSelect.selectedOptions].map((option) => option.value), {
      ...fields,
      ...fieldPayload(form)
    });
  }
  const outcomeOptions = form.querySelector("#outcome-measure-options");
  if (outcomeOptions) {
    const selected = selectedOutcomeMeasureInputs(outcomeOptions);
    updateOutcomeMeasureOutputs(selected, {
      ...fields,
      ...fieldPayload(form)
    });
    outcomeOptions.querySelectorAll(".outcome-measure-chip").forEach((chip) => {
      const input = chip.querySelector("input");
      chip.classList.toggle("selected", Boolean(input?.checked));
    });
  }
}

function setFormControlValue(control, value) {
  if (!control) return;

  const values = Array.isArray(value) ? value.map(String) : [String(value ?? "")];
  if (control instanceof RadioNodeList) {
    const controls = [...control].filter((item) => item instanceof HTMLInputElement);
    if (controls.length && controls.every((item) => item.type === "checkbox")) {
      controls.forEach((item) => {
        item.checked = values.includes(item.value);
      });
      return;
    }
  }
  const target = control instanceof RadioNodeList ? control[0] : control;
  if (!target) return;

  if (target instanceof HTMLSelectElement && target.multiple) {
    [...target.options].forEach((option) => {
      option.selected = values.includes(option.value);
    });
  } else if ("value" in target) {
    target.value = Array.isArray(value) ? values.join("\n") : String(value ?? "");
  }

  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
}

function preserveReportDraft() {
  const form = document.querySelector("#report-form");
  if (!form) return;
  const appointmentId = form.querySelector("input[name='appointmentId']")?.value || "";
  const type = form.querySelector("select[name='type']")?.value || state.reportType;
  state.reportDraftKey = reportDraftKey(appointmentId, type);
  state.reportDraftFields = fieldPayload(form);
  state.reportDraftSummary = form.querySelector("textarea[name='summary']")?.value || "";
}

function resetReportDraftState() {
  state.reportDraftFields = {};
  state.reportDraftKey = "";
  state.reportDraftSummary = "";
  state.reportEquipmentTrialCount = 0;
  state.reportEquipmentOptionCounts = {};
}

function removeEquipmentOptionFromDraft(trialIndex, optionIndex, currentCount) {
  const fields = state.reportDraftFields;
  for (let index = optionIndex; index < currentCount; index += 1) {
    const currentKey = `equipmentTrial_${trialIndex}_option_${index}_name`;
    const nextKey = `equipmentTrial_${trialIndex}_option_${index + 1}_name`;
    fields[currentKey] = fields[nextKey] || "";
  }
  delete fields[`equipmentTrial_${trialIndex}_option_${currentCount}_name`];
}

function updateEquipmentRecommendationsFromForm() {
  const form = document.querySelector("#report-form");
  const list = document.querySelector("#equipment-recommendation-list");
  if (!form || !list) return;
  const fields = fieldPayload(form);
  list.innerHTML = renderChosenModelRecommendations(fields);
}

function currentTabs() {
  if (canUseOwnerWorkspace()) return ownerViewingPractitioner() ? contractorTabs : adminTabs;
  if (state.data?.currentUser.role === "admin") return adminTabs;
  if (state.data?.currentUser.role === "receptionist") return receptionistTabs;
  return contractorTabs;
}

function canUseOwnerWorkspace() {
  const user = state.data?.currentUser;
  return Boolean(
    user
    && user.isOwner
    && user.role !== "contractor"
    && state.data?.permissions?.canAccessPractitionerWorkspace
  );
}

function renderOwnerViewSelect() {
  const contractors = state.data?.contractors || [];
  return `
    <label class="owner-view-control">
      <span>Viewing</span>
      <select data-action="owner-view" aria-label="Switch portal view">
        <option value="admin" ${ownerViewingAdmin() ? "selected" : ""}>Admin</option>
        ${contractors.map((contractor, index) => `
          <option value="${escapeHtml(contractor.id)}" ${ownerViewValue() === contractor.id ? "selected" : ""}>
            ${escapeHtml(contractor.name || `Practitioner ${index + 1}`)}
          </option>
        `).join("")}
      </select>
    </label>
  `;
}

function ownerViewValue() {
  if (!canUseOwnerWorkspace()) return "";
  const contractors = state.data?.contractors || [];
  if (state.ownerView === "admin") return "admin";
  if (contractors.some((contractor) => contractor.id === state.ownerView)) return state.ownerView;
  if (contractors.some((contractor) => contractor.id === state.ownerPractitionerId)) return state.ownerPractitionerId;
  return "admin";
}

function ownerViewingAdmin() {
  return !canUseOwnerWorkspace() || ownerViewValue() === "admin";
}

function ownerViewingPractitioner() {
  return Boolean(canUseOwnerWorkspace() && ownerViewValue() !== "admin");
}

function renderOwnerPractitionerSelect() {
  const practitioner = currentCalendarPractitioner();
  const contractors = state.data?.contractors || [];
  if (!contractors.length) return "";
  return `
    <select class="scheduler-practitioner" data-action="owner-practitioner" aria-label="Choose practitioner">
      ${contractors.map((contractor) => `
        <option value="${escapeHtml(contractor.id)}" ${contractor.id === practitioner?.id ? "selected" : ""}>
          ${escapeHtml(contractor.name)}
        </option>
      `).join("")}
    </select>
  `;
}

function currentCalendarPractitioner() {
  const user = state.data?.currentUser;
  if (!user) return null;
  if (user.role === "contractor") return user;

  const contractors = state.data?.contractors || [];
  if (!contractors.length) return null;
  const selectedId = ownerViewingPractitioner() ? ownerViewValue() : state.ownerPractitionerId;
  const selected = contractors.find((contractor) => contractor.id === selectedId);
  const practitioner = selected || contractors[0];
  if (practitioner.id !== state.ownerPractitionerId) {
    state.ownerPractitionerId = practitioner.id;
    localStorage.setItem("refine-owner-practitioner", practitioner.id);
  }
  return practitioner;
}

function currentCalendarPractitionerId() {
  return currentCalendarPractitioner()?.id || state.data?.currentUser?.id || "";
}

function appointmentsForPractitioner(appointments, practitionerId = currentCalendarPractitionerId()) {
  if (!practitionerId) return [];
  return (appointments || []).filter((appointment) => appointment.contractorId === practitionerId);
}

function clientsForPractitionerWorkspace(clients, practitionerId = currentCalendarPractitionerId()) {
  if (!canUseOwnerWorkspace() || !practitionerId) return clients || [];
  const clientIds = new Set([
    ...appointmentsForPractitioner(state.data.appointments, practitionerId).map((appointment) => appointment.clientId),
    ...(state.data.referrals || [])
      .filter((referral) => referral.assignedContractorId === practitionerId)
      .map((referral) => referral.clientId)
  ]);
  return (clients || []).filter((client) => clientIds.has(client.id));
}

function notificationsForPractitionerWorkspace() {
  const notifications = state.data?.notifications || [];
  if (!ownerViewingPractitioner()) return notifications;
  const practitionerId = currentCalendarPractitionerId();
  return notifications.filter((item) => item.userId === practitionerId);
}

function hiddenTabs() {
  return ["rebook", "notes", "reports", "notesDue", "reportsDue"];
}

function filterItems(items) {
  const search = state.search.trim().toLowerCase();
  if (!search) return items;
  return items.filter((item) => JSON.stringify(item).toLowerCase().includes(search));
}

function filterArchivedAppointments(appointments) {
  const search = state.search.trim().toLowerCase();
  if (!search) return appointments;
  return appointments.filter((appointment) => [
    JSON.stringify(appointment),
    clientName(appointment.clientId),
    userName(appointment.contractorId),
    userName(appointment.archivedBy),
    userName(appointment.createdBy)
  ].join(" ").toLowerCase().includes(search));
}

function appointmentsForDay(appointments, date) {
  const day = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
  return appointments.filter((appointment) => new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(appointment.startsAt)) === day);
}

function sortAppointments(appointments) {
  return [...appointments].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
}

function sortAppointmentsNewest(appointments) {
  return [...appointments].sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt));
}

function sortNotifications(notifications) {
  return [...notifications].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function messageThreadUsers() {
  return state.data.contractors
    .map((user) => ({
      ...user,
      latestMessage: latestMessageForUser(user.id)
    }))
    .sort((a, b) => {
      const aUnread = unreadMessagesFromUser(a.id).length;
      const bUnread = unreadMessagesFromUser(b.id).length;
      if (aUnread !== bUnread) return bUnread - aUnread;
      const aTime = new Date(a.latestMessage?.createdAt || 0);
      const bTime = new Date(b.latestMessage?.createdAt || 0);
      return bTime - aTime || a.name.localeCompare(b.name);
    });
}

function selectedMessageThreadUser(users) {
  if (!users.length) return null;
  const selected = users.find((user) => user.id === state.messageThreadUserId);
  if (selected) return selected;
  const withUnread = users.find((user) => unreadMessagesFromUser(user.id).length);
  if (withUnread) return withUnread;
  const withMessage = users.find((user) => latestMessageForUser(user.id));
  return withMessage || users[0];
}

function messagesForThread(userId) {
  return sortMessages((state.data.messages || []).filter((message) =>
    (message.fromUserId === state.data.currentUser.id && message.toUserId === userId)
    || (message.fromUserId === userId && message.toUserId === state.data.currentUser.id)
  ));
}

function messagesBetweenUsers(firstUserId, secondUserId) {
  return sortMessages((state.data.messages || []).filter((message) =>
    (message.fromUserId === firstUserId && message.toUserId === secondUserId)
    || (message.fromUserId === secondUserId && message.toUserId === firstUserId)
  ));
}

function latestMessageForUser(userId) {
  return sortMessages((state.data.messages || []).filter((message) =>
    message.fromUserId === userId
    || message.toUserId === userId
  )).at(-1);
}

function unreadMessagesFromUser(userId) {
  return (state.data.messages || []).filter((message) =>
    message.fromUserId === userId
    && message.toUserId === state.data.currentUser.id
    && !(message.readBy || []).includes(state.data.currentUser.id)
  );
}

function adminUser() {
  const admins = (state.data.users || []).filter((user) => user.role === "admin" && user.isActive !== false);
  return admins.find((user) => user.isOwner)
    || admins.find((user) => String(user.email || "").toLowerCase().includes("@refinehealthgroup.com.au"))
    || admins[0]
    || null;
}

function sortMessages(messages) {
  return [...messages].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
}

function sortArchivedAppointments(appointments) {
  return [...appointments].sort((a, b) => new Date(b.archivedAt || b.updatedAt || b.startsAt) - new Date(a.archivedAt || a.updatedAt || a.startsAt));
}

function completedReportsForAdmin(reports) {
  return [...reports]
    .filter((report) => reportIsCompletedForAdmin(report) && reportTypeGoesToCaseManager(report.type))
    .sort((a, b) => new Date(b.adminCopySentAt || b.updatedAt || b.createdAt || 0) - new Date(a.adminCopySentAt || a.updatedAt || a.createdAt || 0));
}

function reportIsCompletedForAdmin(report) {
  return ["ready_for_admin", "final"].includes(report.status);
}

function reportTypeGoesToCaseManager(type) {
  return ["Initial Physiotherapy Assessment Report", "Equipment Trial Report"].includes(type);
}

function bookedNewPatientReferrals(referrals) {
  return [...referrals]
    .filter((referral) => referral.status === "booked" && referral.referralSource === "Reception booking")
    .sort((a, b) => {
      const aAppointment = bookedAppointmentForReferral(a);
      const bAppointment = bookedAppointmentForReferral(b);
      return new Date(bAppointment?.startsAt || b.updatedAt || b.createdAt || 0) - new Date(aAppointment?.startsAt || a.updatedAt || a.createdAt || 0);
    });
}

function bookedAppointmentForReferral(referral) {
  const appointments = sortAppointments(state.data.appointments.filter((appointment) =>
    appointment.clientId === referral.clientId && appointment.status !== "cancelled"
  ));
  const now = new Date();
  return appointments.find((appointment) => new Date(appointment.startsAt) >= now) || appointments.at(-1) || null;
}

function sortInboxItems(items) {
  const statusRank = { new: 0, in_progress: 1, waiting: 2, resolved: 3, closed: 4 };
  return [...items].sort((a, b) => {
    const statusDiff = (statusRank[a.status] ?? 5) - (statusRank[b.status] ?? 5);
    if (statusDiff) return statusDiff;
    if (a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function approvalInboxItems(items) {
  return (items || []).filter((item) => item.sourceType === "approval_request");
}

function activeApprovalInboxItems(items) {
  return approvalInboxItems(items).filter((item) => !["resolved", "closed"].includes(item.status));
}

function groupByDay(appointments) {
  return appointments.reduce((groups, appointment) => {
    const day = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Brisbane",
      weekday: "short",
      day: "numeric",
      month: "short"
    }).format(new Date(appointment.startsAt));
    groups[day] ||= [];
    groups[day].push(appointment);
    return groups;
  }, {});
}

function selectedCalendarDateKey() {
  return validDateKey(state.calendarDateKey)
    ? state.calendarDateKey
    : dateKeyFromParts(brisbaneParts(new Date()));
}

function setCalendarDateKey(key) {
  if (!validDateKey(key)) return;
  state.calendarDateKey = key;
  state.calendarMonthOffset = 0;
  localStorage.setItem("refine-calendar-date", key);
  localStorage.setItem("refine-calendar-month-offset", "0");
}

function shiftCalendarMonths(direction) {
  state.calendarMonthOffset += Number(direction || 0);
  localStorage.setItem("refine-calendar-month-offset", String(state.calendarMonthOffset));
}

function validDateKey(key) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(key || ""));
}

function datePartsFromKey(key) {
  if (!validDateKey(key)) return brisbaneParts(new Date());
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

function isMobileCalendarViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 719px)").matches;
}

function effectiveCalendarMode() {
  return isMobileCalendarViewport() ? "week" : state.calendarMode;
}

function calendarRangeLabel(mode = effectiveCalendarMode()) {
  const days = calendarDays(mode);
  if (!days.length) return "";
  if (days.length === 1) return days[0].heading;

  const first = datePartsFromKey(days[0].key);
  const last = datePartsFromKey(days[days.length - 1].key);
  const firstDate = new Date(Date.UTC(first.year, first.month - 1, first.day));
  const lastDate = new Date(Date.UTC(last.year, last.month - 1, last.day));
  const firstOptions = {
    day: "numeric",
    month: "short",
    timeZone: "Australia/Brisbane"
  };
  const firstLabel = new Intl.DateTimeFormat("en-AU", firstOptions).format(firstDate);
  const lastLabel = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Australia/Brisbane"
  }).format(lastDate);
  return `${firstLabel} - ${lastLabel}`;
}

function calendarDays(mode) {
  const today = brisbaneParts(new Date());
  const selectedParts = datePartsFromKey(selectedCalendarDateKey());
  const selectedUtc = Date.UTC(selectedParts.year, selectedParts.month - 1, selectedParts.day);
  const dayCount = mode === "week" ? 7 : 1;
  const weekOffset = mode === "week" ? -((new Date(selectedUtc).getUTCDay() + 6) % 7) : 0;

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(selectedUtc + (weekOffset + index) * 24 * 60 * 60 * 1000);
    const parts = {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate()
    };

    return {
      key: dateKeyFromParts(parts),
      isToday: dateKeyFromParts(parts) === dateKeyFromParts(today),
      weekday: new Intl.DateTimeFormat("en-AU", { weekday: "short", timeZone: "Australia/Brisbane" }).format(date),
      label: new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Brisbane" }).format(date),
      heading: new Intl.DateTimeFormat("en-AU", {
        weekday: "short",
        day: "numeric",
        month: "long",
        timeZone: "Australia/Brisbane"
      }).format(date)
    };
  });
}

function calendarSlots(appointments, days, practitioner = currentCalendarPractitioner()) {
  const dayKeys = new Set(days.map((day) => day.key));
  const ranges = days.map((day) => practitionerWorkingHours(practitioner, day.key));
  const startValues = ranges.map((hours) => hours.start).filter(Number.isFinite);
  const endValues = ranges.map((hours) => hours.end).filter(Number.isFinite);
  let min = Math.min(7 * 60, ...startValues);
  let max = Math.max((21 * 60) + 15, ...endValues.map((end) => end + 15));

  appointments
    .filter((appointment) => appointment.status !== "cancelled" && dayKeys.has(brisbaneDateKey(appointment.startsAt)))
    .forEach((appointment) => {
      min = Math.min(min, appointmentSlotMinutes(appointment));
      max = Math.max(max, appointmentEndSlotMinutes(appointment));
    });

  unavailableBlocksForDays(days).forEach((block) => {
    min = Math.min(min, unavailableBlockStartSlot(block));
    max = Math.max(max, unavailableBlockEndSlot(block));
  });

  min = Math.max(0, Math.floor(min / 15) * 15);
  max = Math.min(24 * 60, Math.ceil(max / 15) * 15);
  if (max <= min) max = min + 60;

  const slots = [];
  for (let slot = min; slot < max; slot += 15) {
    slots.push(slot);
  }
  return slots;
}

function calendarSlotIsHour(slot) {
  return slot % 60 === 0;
}

function calendarSlotIsHalfHour(slot) {
  return slot % 60 === 30;
}

function practitionerWorkingHours(practitioner = currentCalendarPractitioner(), dayKey = "") {
  const segments = practitionerWorkingSegmentsForDay(practitioner, dayKey);
  if (segments.length) {
    return {
      start: Math.min(...segments.map((segment) => segment.startMinutes)),
      end: Math.max(...segments.map((segment) => segment.endMinutes))
    };
  }
  if (dayKey && practitionerHasDailyWorkingHours(practitioner)) return { start: Number.NaN, end: Number.NaN };
  const start = timeStringToMinutes(practitionerWorkingStart(practitioner), 9 * 60);
  const end = timeStringToMinutes(practitionerWorkingEnd(practitioner), 17 * 60);
  if (end <= start) return { start: 9 * 60, end: 17 * 60 };
  return { start, end };
}

function practitionerWorkingStart(practitioner = {}) {
  return validTimeString(practitioner?.workingStart) ? practitioner.workingStart : "09:00";
}

function practitionerWorkingEnd(practitioner = {}) {
  return validTimeString(practitioner?.workingEnd) ? practitioner.workingEnd : "17:00";
}

function validTimeString(value) {
  return /^\d{2}:\d{2}$/.test(String(value || ""));
}

function timeStringToMinutes(value, fallback) {
  if (!validTimeString(value)) return fallback;
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return fallback;
  return hour * 60 + minute;
}

function practitionerWorkingSegmentsForDay(practitioner = {}, dayKey = "") {
  if (!dayKey || !practitionerHasDailyWorkingHours(practitioner)) return [];
  const dayIndex = dayOfWeekFromDateKey(dayKey);
  const segments = practitioner?.workingHoursByDay?.[String(dayIndex)] || [];
  return segments
    .map((segment) => ({
      start: segment.start,
      end: segment.end,
      startMinutes: timeStringToMinutes(segment.start, Number.NaN),
      endMinutes: timeStringToMinutes(segment.end, Number.NaN)
    }))
    .filter((segment) =>
      Number.isFinite(segment.startMinutes)
      && Number.isFinite(segment.endMinutes)
      && segment.endMinutes > segment.startMinutes
    );
}

function practitionerHasDailyWorkingHours(practitioner = {}) {
  return practitioner?.workingHoursSource === "cliniko_daily_availability"
    || Boolean(practitioner?.workingHoursByDay && Object.keys(practitioner.workingHoursByDay).length);
}

function dayOfWeekFromDateKey(dayKey) {
  const [year, month, day] = String(dayKey || "").split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return 0;
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

function calendarSlotIsOutsideWorkHours(slot, practitioner = currentCalendarPractitioner(), dayKey = "") {
  const segments = practitionerWorkingSegmentsForDay(practitioner, dayKey);
  if (segments.length) {
    return !segments.some((segment) => slot >= segment.startMinutes && slot < segment.endMinutes);
  }
  if (dayKey && practitionerHasDailyWorkingHours(practitioner)) return true;
  const hours = practitionerWorkingHours(practitioner);
  return slot < hours.start || slot >= hours.end;
}

function calendarSlotClasses(slot, baseClass, practitioner = currentCalendarPractitioner(), dayKey = "") {
  return [
    baseClass,
    calendarSlotIsHour(slot) ? "is-hour" : "",
    calendarSlotIsHalfHour(slot) ? "is-half-hour" : "",
    calendarSlotIsOutsideWorkHours(slot, practitioner, dayKey) ? "is-outside-hours" : ""
  ].filter(Boolean).join(" ");
}

function calendarTimeClass(slot, practitioner = currentCalendarPractitioner()) {
  return calendarSlotClasses(slot, "calendar-time", practitioner);
}

function calendarCellClass(slot, practitioner = currentCalendarPractitioner(), dayKey = "") {
  return calendarSlotClasses(slot, "calendar-cell", practitioner, dayKey);
}

function appointmentSlotMinutes(appointment) {
  const parts = brisbaneParts(appointment.startsAt);
  return parts.hour * 60 + Math.floor(parts.minute / 15) * 15;
}

function appointmentEndSlotMinutes(appointment) {
  const start = appointmentSlotMinutes(appointment);
  const startKey = brisbaneDateKey(appointment.startsAt);
  const endKey = brisbaneDateKey(appointment.endsAt);
  if (endKey !== startKey) return 24 * 60;

  const parts = brisbaneParts(appointment.endsAt);
  const end = parts.hour * 60 + Math.ceil(parts.minute / 15) * 15;
  return Math.max(end, start + 15);
}

function appointmentSlotSpan(appointment) {
  return Math.max(1, Math.round((appointmentEndSlotMinutes(appointment) - appointmentSlotMinutes(appointment)) / 15));
}

function appointmentDurationMinutes(appointment) {
  const startsAt = new Date(appointment.startsAt);
  const endsAt = new Date(appointment.endsAt);
  const duration = Math.round((endsAt - startsAt) / 60000);
  return Number.isFinite(duration) ? Math.max(15, duration) : 60;
}

function appointmentIsClinikoReadOnly(appointment) {
  return Boolean(appointment?.clinikoId) && !state.data?.clinikoConfig?.appointmentWriteEnabled;
}

function appointmentEventTone(appointment) {
  const typeInfo = appointmentTypeColour(appointment);
  const baseTone = typeInfo?.eventTone || (appointmentRequiresReport(appointment) ? "is-report" : "is-physio");
  if (appointment.status === "completed") return `${baseTone} is-complete`;
  if (appointment.status === "pending_approval") return `${baseTone} is-pending-approval`;
  if (appointment.status === "rescheduled") return `${baseTone} is-rescheduled`;
  if (appointment.status === "no-show") return `${baseTone} is-no-show`;
  return baseTone;
}

function appointmentCardTone(appointment) {
  return appointmentTypeColour(appointment)?.eventTone || "";
}

function appointmentEventCaption(appointment) {
  const typeInfo = appointmentTypeColour(appointment);
  const label = typeInfo?.label || appointment.appointmentType || appointment.recurrence || appointment.serviceType || "Appointment";
  return label;
}

function appointmentStatusEmoji(appointment) {
  return "";
}

function appointmentCompletionMarkers(appointment) {
  const markers = [];
  const report = exactReportForAppointment(appointment);

  if (appointmentRequiresTreatmentNote(appointment) && appointmentNotesComplete(appointment)) {
    markers.push({ emoji: "📝", label: "Notes completed" });
  }

  if (appointmentRequiresReport(appointment) && report && reportIsCompletedForAdmin(report)) {
    markers.push({ emoji: "📄", label: "Report sent" });
  }

  return markers;
}

function appointmentCompletionEmoji(appointment) {
  const emoji = appointmentCompletionMarkers(appointment).map((marker) => marker.emoji).join("");
  return emoji ? `${emoji} ` : "";
}

function renderAppointmentCompletionPills(appointment, withWrapper = true) {
  const content = appointmentCompletionMarkers(appointment)
    .map((marker) => `<span class="pill blue appointment-completion-pill" aria-label="${escapeHtml(marker.label)}" title="${escapeHtml(marker.label)}">${escapeHtml(marker.emoji)}</span>`)
    .join("");

  if (!content) return "";
  return withWrapper ? `<div class="meta-row appointment-completion-row">${content}</div>` : content;
}

function renderCalendarCompletionText(appointment) {
  return "";
}

function appointmentTypeColour(appointment) {
  const type = appointmentBookingText(appointment);
  if (type.includes("equipment")) {
    return {
      eventTone: "is-type-equipment-trial",
      pillTone: "equipment-trial",
      label: "Equipment Trial"
    };
  }
  if (type.includes("initial") && type.includes("sah")) {
    return {
      eventTone: "is-type-initial-sah",
      pillTone: "initial-sah",
      label: "Initial Physio SAH"
    };
  }
  if (type.includes("subsequent") && type.includes("sah")) {
    return {
      eventTone: "is-type-subsequent-sah",
      pillTone: "subsequent-sah",
      label: "Subsequent Physio SAH"
    };
  }
  if (type.includes("initial") && type.includes("chsp")) {
    return {
      eventTone: "is-type-initial-chsp",
      pillTone: "initial-chsp",
      label: "Initial Physio CHSP"
    };
  }
  if (type.includes("subsequent") && type.includes("chsp")) {
    return {
      eventTone: "is-type-subsequent-chsp",
      pillTone: "subsequent-chsp",
      label: "Subsequent Physio CHSP"
    };
  }
  return null;
}

function slotHasConflict(dayKey, slot, durationMinutes, appointments, ignoredAppointmentId = "") {
  const proposedEnd = slot + durationMinutes;
  return appointments.some((appointment) => {
    if (appointment.id === ignoredAppointmentId) return false;
    if (appointment.status === "cancelled") return false;
    if (brisbaneDateKey(appointment.startsAt) !== dayKey) return false;

    const appointmentStart = appointmentSlotMinutes(appointment);
    const appointmentEnd = appointmentEndSlotMinutes(appointment);
    return slot < appointmentEnd && proposedEnd > appointmentStart;
  });
}

function slotHasUnavailableConflict(dayKey, slot, durationMinutes, ignoredBlockId = "") {
  const proposedEnd = slot + durationMinutes;
  return unavailableBlocksForDays([{ key: dayKey }]).some((block) => {
    if (block.id === ignoredBlockId) return false;
    if (!unavailableBlockBlocksBooking(block)) return false;
    const blockStart = unavailableBlockStartSlot(block);
    const blockEnd = unavailableBlockEndSlot(block);
    return slot < blockEnd && proposedEnd > blockStart;
  });
}

function unavailableBlocksForDays(days) {
  const dayKeys = new Set(days.map((day) => day.key));
  const practitionerId = currentCalendarPractitionerId();
  return allUnavailableBlocks()
    .filter((block) =>
      block.contractorId === practitionerId
      && dayKeys.has(unavailableBlockDayKey(block))
    )
    .sort((a, b) => a.startsAtLocal.localeCompare(b.startsAtLocal));
}

function allUnavailableBlocks() {
  const syncedBlocks = state.data?.unavailableBlocks || [];
  const syncedIds = new Set(syncedBlocks.map((block) => block.id));
  return [
    ...syncedBlocks,
    ...state.unavailableBlocks.filter((block) => !syncedIds.has(block.id))
  ];
}

function unavailableBlockIsReadOnly(block = {}) {
  return Boolean(block.readOnly || block.syncSource === "cliniko" || block.clinikoUnavailableBlockId);
}

function unavailableBlockBlocksBooking(block = {}) {
  return !unavailableBlockIsReadOnly(block);
}

function unavailableBlockDayKey(block) {
  return String(block.startsAtLocal || "").split("T")[0] || "";
}

function unavailableBlockStartSlot(block) {
  return localSlotMinutes(block.startsAtLocal) ?? 0;
}

function unavailableBlockEndSlot(block) {
  const start = unavailableBlockStartSlot(block);
  const endDayKey = String(block.endsAtLocal || "").split("T")[0];
  if (endDayKey && endDayKey !== unavailableBlockDayKey(block)) return 24 * 60;
  return Math.max(start + 15, localSlotMinutes(block.endsAtLocal) ?? start + 60);
}

function unavailableBlockSlotSpan(block) {
  return Math.max(1, Math.ceil((unavailableBlockEndSlot(block) - unavailableBlockStartSlot(block)) / 15));
}

function blockKindLabel(kind) {
  return kind === "travel" ? "Travel" : "Unavailable";
}

function slotIsPast(dayKey, slot) {
  const now = brisbaneParts(new Date());
  const todayKey = dateKeyFromParts(now);
  const currentSlot = now.hour * 60 + now.minute;

  if (dayKey < todayKey) return true;
  if (dayKey > todayKey) return false;
  return slot <= currentSlot;
}

function localDateTimeFromDaySlot(dayKey, slot) {
  const hour = Math.floor(slot / 60);
  const minute = slot % 60;
  return `${dayKey}T${pad2(hour)}:${pad2(minute)}`;
}

function localSlotMinutes(value) {
  const timePart = String(value || "").split("T")[1] || "";
  const [hour, minute] = timePart.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + Math.floor(minute / 15) * 15;
}

function isoFromBrisbaneLocalDateTime(value) {
  const [datePart, timePart] = String(value || "").split("T");
  if (!datePart || !timePart) return "";
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  if ([year, month, day, hour, minute].some((part) => !Number.isFinite(part))) return "";
  return new Date(Date.UTC(year, month - 1, day, hour - 10, minute)).toISOString();
}

async function moveAppointmentToSlot(appointmentId, dayKey, slot) {
  const appointment = state.data.appointments.find((item) => item.id === appointmentId);
  if (!appointment || !dayKey || !Number.isFinite(slot)) return;
  const startsAtLocal = localDateTimeFromDaySlot(dayKey, slot);
  await moveAppointmentToLocalStart(appointment.id, startsAtLocal, appointmentDurationMinutes(appointment));
}

function moveUnavailableBlockToSlot(blockId, dayKey, slot) {
  const block = state.unavailableBlocks.find((item) => item.id === blockId);
  if (!block || !dayKey || !Number.isFinite(slot)) return;
  const duration = unavailableBlockEndSlot(block) - unavailableBlockStartSlot(block);
  const startsAtLocal = localDateTimeFromDaySlot(dayKey, slot);
  const appointmentsForContractor = state.data.appointments.filter((appointment) =>
    appointment.contractorId === block.contractorId
  );

  if (slotHasConflict(dayKey, slot, duration, appointmentsForContractor)) {
    toast("That time already has an appointment");
    return;
  }

  if (slotHasUnavailableConflict(dayKey, slot, duration, block.id)) {
    toast("That time is already unavailable");
    return;
  }

  block.startsAtLocal = startsAtLocal;
  block.endsAtLocal = addMinutesToLocalDateTime(startsAtLocal, duration);
  saveUnavailableBlocks();
  toast(`Unavailable block moved to ${formatSelectedSlot(startsAtLocal)}`);
}

async function moveAppointmentToLocalStart(appointmentId, startsAtLocal, durationMinutes, appointmentType = "") {
  const appointment = state.data.appointments.find((item) => item.id === appointmentId);
  const dayKey = String(startsAtLocal || "").split("T")[0];
  const slot = localSlotMinutes(startsAtLocal);
  if (!appointment || !dayKey || slot === null) return;

  if (appointmentIsClinikoReadOnly(appointment)) {
    toast("Edit Cliniko synced appointments in Cliniko, then use Sync Now");
    return;
  }

  const duration = Math.max(15, Number(durationMinutes) || appointmentDurationMinutes(appointment));
  const appointmentsForContractor = state.data.appointments.filter((item) => item.contractorId === appointment.contractorId);
  if (slotHasConflict(dayKey, slot, duration, appointmentsForContractor, appointment.id)) {
    toast("That time overlaps another appointment");
    return;
  }

  if (slotHasUnavailableConflict(dayKey, slot, duration)) {
    toast("That time is marked unavailable");
    return;
  }

  const startsAtIso = isoFromBrisbaneLocalDateTime(startsAtLocal);
  if (!startsAtIso) {
    toast("Choose a valid appointment time");
    return;
  }

  const endsAtIso = new Date(new Date(startsAtIso).getTime() + duration * 60 * 1000).toISOString();
  const body = {
    startsAt: startsAtIso,
    endsAt: endsAtIso,
    actorId: state.data.currentUser.id
  };
  if (appointmentType) {
    body.appointmentType = appointmentType;
    body.recurrence = appointmentType;
  }
  try {
    await fetchJson(`/api/appointments/${appointment.id}`, {
      method: "PATCH",
      body
    });
  } catch (error) {
    toast(error.message);
    await loadData();
    return;
  }
  state.calendarAppointmentId = "";
  state.calendarAppointmentMode = "details";
  toast(appointment.clinikoId ? "Appointment updated in Cliniko" : `Appointment moved to ${formatSelectedSlot(startsAtLocal)}`);
  await loadData();
}

function calendarDragData(dataTransfer) {
  try {
    const data = JSON.parse(dataTransfer.getData("application/json") || "{}");
    if (data.id) return data;
  } catch {
    // Fall back to the plain text payload below.
  }
  return {
    id: dataTransfer.getData("text/plain"),
    type: "appointment"
  };
}

function startCalendarResize(event) {
  event.preventDefault();
  event.stopPropagation();

  const handle = event.currentTarget;
  const itemEl = handle.closest(".calendar-event, .calendar-unavailable-block");
  const source = calendarResizeSource(handle.dataset.resizeType, handle.dataset.resizeId);
  if (!itemEl || !source) return;

  itemEl.dataset.skipClick = "true";
  itemEl.dataset.wasDraggable = itemEl.getAttribute("draggable") || "";
  itemEl.setAttribute("draggable", "false");
  itemEl.classList.add("is-resizing");
  handle.setPointerCapture?.(event.pointerId);
  let lastTarget = resizeTargetFromPoint(event.clientX, event.clientY, source.dayKey);

  const resizeMove = (moveEvent) => {
    const target = resizeTargetFromPoint(moveEvent.clientX, moveEvent.clientY, source.dayKey);
    if (!target) return;
    lastTarget = target;
    const endSlot = Math.max(source.startSlot + 15, target.slot + 15);
    const span = Math.ceil((endSlot - source.startSlot) / 15);
    itemEl.style.setProperty("--slot-span", span);
  };

  const resizeEnd = async (upEvent) => {
    document.removeEventListener("pointermove", resizeMove);
    document.removeEventListener("pointerup", resizeEnd);
    itemEl.classList.remove("is-resizing");
    itemEl.setAttribute("draggable", itemEl.dataset.wasDraggable || "true");

    const target = resizeTargetFromPoint(upEvent.clientX, upEvent.clientY, source.dayKey) || lastTarget;
    const endSlot = target ? Math.max(source.startSlot + 15, target.slot + 15) : source.startSlot + source.duration;
    const duration = Math.max(15, endSlot - source.startSlot);

    if (source.type === "unavailable") {
      resizeUnavailableBlock(source.id, duration);
      render();
    } else {
      await resizeAppointment(source.id, duration);
    }

    window.setTimeout(() => {
      itemEl.dataset.skipClick = "";
    }, 0);
  };

  document.addEventListener("pointermove", resizeMove);
  document.addEventListener("pointerup", resizeEnd, { once: true });
}

function calendarResizeSource(type, id) {
  if (type === "unavailable") {
    const block = state.unavailableBlocks.find((item) => item.id === id);
    if (!block) return null;
    const startSlot = unavailableBlockStartSlot(block);
    return {
      id,
      type,
      dayKey: unavailableBlockDayKey(block),
      startSlot,
      duration: unavailableBlockEndSlot(block) - startSlot
    };
  }

  const appointment = state.data.appointments.find((item) => item.id === id);
  if (!appointment) return null;
  return {
    id,
    type: "appointment",
    dayKey: brisbaneDateKey(appointment.startsAt),
    startSlot: appointmentSlotMinutes(appointment),
    duration: appointmentDurationMinutes(appointment)
  };
}

function resizeTargetFromPoint(x, y, dayKey) {
  const cells = [...document.querySelectorAll(".calendar-cell[data-calendar-day][data-calendar-slot]")]
    .filter((item) => item.dataset.calendarDay === dayKey);
  const columnCells = cells.filter((cell) => {
    const rect = cell.getBoundingClientRect();
    return x >= rect.left && x <= rect.right;
  });
  if (!columnCells.length) return null;

  const cell = columnCells.find((item) => {
    const rect = item.getBoundingClientRect();
    return y >= rect.top && y < rect.bottom;
  }) || nearestCalendarCellByY(columnCells, y);

  if (!cell) return null;
  return { slot: Number(cell.dataset.calendarSlot) };
}

function nearestCalendarCellByY(cells, y) {
  return cells
    .map((cell) => {
      const rect = cell.getBoundingClientRect();
      return {
        cell,
        distance: y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0
      };
    })
    .sort((a, b) => a.distance - b.distance)[0]?.cell || null;
}

async function resizeAppointment(appointmentId, durationMinutes) {
  const appointment = state.data.appointments.find((item) => item.id === appointmentId);
  if (!appointment) return;

  if (appointmentIsClinikoReadOnly(appointment)) {
    toast("Edit Cliniko synced appointments in Cliniko, then use Sync Now");
    await loadData();
    return;
  }

  const dayKey = brisbaneDateKey(appointment.startsAt);
  const slot = appointmentSlotMinutes(appointment);
  const duration = Math.max(15, Math.ceil(durationMinutes / 15) * 15);
  const appointmentsForContractor = state.data.appointments.filter((item) => item.contractorId === appointment.contractorId);

  if (slotHasConflict(dayKey, slot, duration, appointmentsForContractor, appointment.id)) {
    toast("That length overlaps another appointment");
    await loadData();
    return;
  }

  if (slotHasUnavailableConflict(dayKey, slot, duration)) {
    toast("That length overlaps unavailable time");
    await loadData();
    return;
  }

  const endsAt = new Date(new Date(appointment.startsAt).getTime() + duration * 60 * 1000).toISOString();
  try {
    await fetchJson(`/api/appointments/${appointment.id}`, {
      method: "PATCH",
      body: {
        endsAt,
        actorId: state.data.currentUser.id
      }
    });
  } catch (error) {
    toast(error.message);
    await loadData();
    return;
  }
  state.calendarAppointmentId = "";
  state.calendarAppointmentMode = "details";
  toast("Appointment length updated");
  await loadData();
}

function resizeUnavailableBlock(blockId, durationMinutes) {
  const block = state.unavailableBlocks.find((item) => item.id === blockId);
  if (!block) return;
  const dayKey = unavailableBlockDayKey(block);
  const slot = unavailableBlockStartSlot(block);
  const duration = Math.max(15, Math.ceil(durationMinutes / 15) * 15);
  const appointmentsForContractor = state.data.appointments.filter((appointment) =>
    appointment.contractorId === block.contractorId
  );

  if (slotHasConflict(dayKey, slot, duration, appointmentsForContractor)) {
    toast("That length overlaps an appointment");
    return;
  }

  if (slotHasUnavailableConflict(dayKey, slot, duration, block.id)) {
    toast("That length overlaps another unavailable block");
    return;
  }

  block.endsAtLocal = addMinutesToLocalDateTime(block.startsAtLocal, duration);
  saveUnavailableBlocks();
  toast("Unavailable block length updated");
}

function brisbaneDateKey(value) {
  return dateKeyFromParts(brisbaneParts(value));
}

function brisbaneParts(value) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date(value)).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: parts.weekday,
    hour: Number(parts.hour) === 24 ? 0 : Number(parts.hour),
    minute: Number(parts.minute)
  };
}

function dateKeyFromParts(parts) {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function formatSlotTime(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour >= 12 ? "pm" : "am";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${pad2(minute)} ${suffix}`;
}

function formatCalendarTimeAxisLabel(minutes) {
  if (!calendarSlotIsHour(minutes)) return "";
  const hour = Math.floor(minutes / 60);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour} ${suffix}`;
}

function formatLocalTime(value) {
  const slot = localSlotMinutes(value);
  return slot === null ? "" : formatSlotTime(slot);
}

function formatSelectedSlot(value) {
  const [datePart, timePart] = String(value || "").split("T");
  if (!datePart || !timePart) return "appointment time";
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC"
  }).format(date);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function defaultRebookStart(clientId) {
  if (state.rebookSelectedStartLocal) return state.rebookSelectedStartLocal;
  const sourceAppointment = state.data.appointments.find((appointment) => appointment.id === state.rebookFromAppointmentId);
  const clientAppointments = sortAppointments(state.data.appointments.filter((appointment) => appointment.clientId === clientId));
  const base = sourceAppointment || clientAppointments.at(-1);
  const date = base ? new Date(base.startsAt) : new Date();
  date.setDate(date.getDate() + (base ? 7 : 1));
  if (!base) date.setHours(9, 0, 0, 0);
  return toDateTimeLocalBrisbane(date);
}

function defaultUnavailableStartLocal() {
  const now = new Date();
  now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
  return toDateTimeLocalBrisbane(now);
}

function defaultRebookDurationMinutes() {
  return 60;
}

function toDateTimeLocalBrisbane(date) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function addMinutesToLocalDateTime(value, minutes) {
  const [datePart, timePart] = String(value || "").split("T");
  if (!datePart || !timePart) return value;
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  if ([year, month, day, hour, minute].some((part) => !Number.isFinite(part))) return value;

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute) + minutes * 60 * 1000);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}T${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
}

function localDateTimeIsPast(value) {
  const isoValue = isoFromBrisbaneLocalDateTime(value);
  return isoValue ? new Date(isoValue) < new Date() : false;
}

function hourOptions() {
  return Array.from({ length: 12 }, (_, index) => pad2(index + 1));
}

function minuteOptions() {
  return ["00", "15", "30", "45"];
}

function timeSelectParts(value) {
  const timePart = String(value || "").split("T")[1] || "09:00";
  const [hourValue, minuteValue] = timePart.split(":").map(Number);
  const hour24 = Number.isFinite(hourValue) ? hourValue : 9;
  return {
    hour: pad2(hour24 % 12 || 12),
    minute: pad2(Number.isFinite(minuteValue) ? minuteValue : 0),
    period: hour24 >= 12 ? "PM" : "AM"
  };
}

function timePartSelect(name, options, selected) {
  return `
    <select name="${name}" aria-label="${escapeHtml(labelFromKey(name))}">
      ${options.map((option) => `<option value="${escapeHtml(option)}" ${option === selected ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
    </select>
  `;
}

function clientAddressLines(client) {
  const lines = String(client.address || "")
    .split(",")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return ["No address recorded"];
  if (!lines.some((line) => line.toLowerCase() === "australia")) lines.push("Australia");
  return lines;
}

function setNewAppointmentTimeFields(startsAtLocal, durationMinutes) {
  const form = document.querySelector("#rebook-form");
  if (!form || !startsAtLocal) return;
  const duration = durationMinutes || defaultRebookDurationMinutes();
  const endLocal = addMinutesToLocalDateTime(startsAtLocal, duration);
  const startTime = timeSelectParts(startsAtLocal);
  const endTime = timeSelectParts(endLocal);
  const dateInput = form.querySelector("input[name='bookingDate']");
  const durationInput = form.querySelector("input[name='durationMinutes']");
  if (dateInput) dateInput.value = startsAtLocal.split("T")[0];
  if (durationInput) durationInput.value = String(duration);
  setFormValue(form, "startHour", startTime.hour);
  setFormValue(form, "startMinute", startTime.minute);
  setFormValue(form, "startPeriod", startTime.period);
  setFormValue(form, "endHour", endTime.hour);
  setFormValue(form, "endMinute", endTime.minute);
  setFormValue(form, "endPeriod", endTime.period);
}

function syncRebookEndTimeFromStart() {
  const form = document.querySelector("#rebook-form");
  if (!form) return;
  const bookingDate = form.querySelector("input[name='bookingDate']")?.value;
  const startHour = form.querySelector("select[name='startHour']")?.value;
  const startMinute = form.querySelector("select[name='startMinute']")?.value;
  const startPeriod = form.querySelector("select[name='startPeriod']")?.value;
  if (!bookingDate || !startHour || !startMinute || !startPeriod) return;
  const startsAtLocal = `${bookingDate}T${timeSelectTo24Hour(startHour, startMinute, startPeriod)}`;
  setNewAppointmentTimeFields(startsAtLocal, defaultRebookDurationMinutes());
}

function focusRebookCalendar() {
  window.setTimeout(() => {
    document.querySelector(".rebook-calendar-stage")?.scrollIntoView({ block: "start" });
  }, 0);
}

function focusRebookForm() {
  window.setTimeout(() => {
    document.querySelector(".rebook-booking-inline, .rebook-booking-popover")?.scrollIntoView({ block: "nearest" });
  }, 0);
}

function closeCalendarBooking() {
  state.calendarBookingStartLocal = "";
  state.calendarBookingClientId = "";
  state.calendarBookingPatientMode = "existing";
}

function closeUnavailableBlock() {
  state.unavailableBlockId = "";
  state.unavailableBlockStartLocal = "";
  state.unavailableBlockKind = "unavailable";
}

function closeReportReminder() {
  state.reportReminderAppointmentId = "";
}

function deleteUnavailableBlock(id) {
  state.unavailableBlocks = state.unavailableBlocks.filter((block) => block.id !== id);
  saveUnavailableBlocks();
  closeUnavailableBlock();
}

function setFormValue(form, name, value) {
  const field = form.querySelector(`[name='${name}']`);
  if (field) field.value = value;
}

function appointmentTimesFromPayload(payload) {
  const startsAtLocal = payload.startsAtLocal || `${payload.bookingDate}T${timeSelectTo24Hour(payload.startHour, payload.startMinute, payload.startPeriod)}`;
  const proposedEndLocal = payload.bookingDate
    ? `${payload.bookingDate}T${timeSelectTo24Hour(payload.endHour, payload.endMinute, payload.endPeriod)}`
    : addMinutesToLocalDateTime(startsAtLocal, Number(payload.durationMinutes || 60));
  const startsAt = isoFromBrisbaneLocalDateTime(startsAtLocal);
  let endsAt = isoFromBrisbaneLocalDateTime(proposedEndLocal);
  let endsAtLocal = proposedEndLocal;
  const fallbackDuration = Math.max(15, Number(payload.durationMinutes || 60));

  if (!startsAt) throw new Error("Choose a valid appointment time");
  if (!endsAt || new Date(endsAt) <= new Date(startsAt)) {
    endsAt = new Date(new Date(startsAt).getTime() + fallbackDuration * 60 * 1000).toISOString();
    endsAtLocal = addMinutesToLocalDateTime(startsAtLocal, fallbackDuration);
  }

  return {
    startsAt,
    endsAt,
    startsAtLocal,
    endsAtLocal,
    dayKey: startsAtLocal.split("T")[0],
    slot: localSlotMinutes(startsAtLocal) ?? 0,
    durationMinutes: Math.max(15, Math.round((new Date(endsAt) - new Date(startsAt)) / 60000))
  };
}

function timeSelectTo24Hour(hourValue, minuteValue, periodValue) {
  let hour = Number(hourValue || 9);
  const minute = Number(minuteValue || 0);
  if (String(periodValue).toUpperCase() === "PM" && hour < 12) hour += 12;
  if (String(periodValue).toUpperCase() === "AM" && hour === 12) hour = 0;
  return `${pad2(hour)}:${pad2(minute)}`;
}

function deleteAppointmentTimeFields(payload) {
  [
    "startsAtLocal",
    "bookingDate",
    "startHour",
    "startMinute",
    "startPeriod",
    "endHour",
    "endMinute",
    "endPeriod"
  ].forEach((field) => delete payload[field]);
}

function contractorOptions(includeBlank) {
  const options = state.data.contractors.map((contractor) => [contractor.id, `${contractor.name} - ${contractor.discipline}`]);
  return includeBlank ? [["", "Unassigned"], ...options] : options;
}

function bookingTypeOptions(discipline) {
  return [
    "Initial Physiotherapy SAH",
    "Initial Physiotherapy CHSP",
    "Subsequent Physiotherapy SAH",
    "Subsequent Physiotherapy CHSP",
    "Equipment Trial"
  ];
}

function calendarBookingTypeOptions(discipline) {
  return [
    ...bookingTypeOptions(discipline),
    "Unavailable block",
    "Travel block"
  ];
}

function appointmentTypeOptionsForEdit(appointment) {
  const current = appointment.appointmentType || appointment.recurrence || "";
  const clinikoTypes = (state.data.appointmentTypes || [])
    .filter((type) => !type.archivedAt)
    .map((type) => type.name)
    .filter(Boolean);
  return uniqueValues([
    current,
    ...clinikoTypes,
    ...receptionAppointmentTypes()
  ]);
}

function uniqueValues(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = String(value || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function blockKindFromAppointmentType(value) {
  const type = String(value || "").toLowerCase();
  if (type.includes("travel")) return "travel";
  if (type.includes("unavailable")) return "unavailable";
  return "";
}

function receptionAppointmentTypes() {
  return [
    "Initial Physiotherapy SAH",
    "Initial Physiotherapy CHSP",
    "Subsequent Physiotherapy SAH",
    "Subsequent Physiotherapy CHSP",
    "Equipment Trial"
  ];
}

function serviceForAppointmentType(appointmentType) {
  return "Physiotherapy";
}

function reportTypeForAppointment(appointment) {
  if (isEquipmentTrialReportAppointment(appointment)) return "Equipment Trial Report";
  if (isInitialPhysioReportAppointment(appointment)) return "Initial Physiotherapy Assessment Report";
  return "";
}

function reportReminderDefaultMessage(appointment) {
  const practitionerName = userName(appointment.contractorId).split(" ")[0] || "there";
  const reportType = reportTypeForAppointment(appointment) || "report";
  return `Hi ${practitionerName}, please finalise the ${reportType} for ${clientName(appointment.clientId)} from ${formatDateTime(appointment.startsAt)}. Thanks.`;
}

function isInitialPhysioReport(type) {
  return String(type || "").toLowerCase().includes("initial physiotherapy");
}

function isEquipmentTrialReport(type) {
  return String(type || "").toLowerCase().includes("equipment trial");
}

function reportDraftKey(appointmentId, type) {
  return `${appointmentId || "new"}::${type || ""}`;
}

function equipmentTrialCount(fields = {}) {
  const fromFields = maxEquipmentTrialIndex(fields);
  return Math.max(state.reportEquipmentTrialCount || 0, fromFields, 1);
}

function equipmentOptionCount(trialIndex, fields = {}) {
  const fromFields = maxEquipmentOptionIndex(trialIndex, fields);
  return Math.max(state.reportEquipmentOptionCounts[trialIndex] || 0, fromFields, 2);
}

function maxEquipmentTrialIndex(fields = {}) {
  return Object.keys(fields).reduce((max, key) => {
    const match = key.match(/^equipmentTrial_(\d+)_/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
}

function maxEquipmentOptionIndex(trialIndex, fields = {}) {
  return Object.keys(fields).reduce((max, key) => {
    const match = key.match(new RegExp(`^equipmentTrial_${trialIndex}_option_(\\d+)_name$`));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
}

function chosenEquipmentModels(fields = {}) {
  const trialCount = equipmentTrialCount(fields);
  const models = [];
  for (let trialIndex = 1; trialIndex <= trialCount; trialIndex += 1) {
    const model = String(fields[`equipmentTrial_${trialIndex}_chosenModel`] || "").trim();
    if (!model) continue;
    models.push({
      title: fields[`equipmentTrial_${trialIndex}_title`] || `Trialled equipment ${trialIndex}`,
      model
    });
  }
  return models;
}

function appointmentContactNumber(appointment) {
  return appointment.contactNumber || state.data.clients.find((client) => client.id === appointment.clientId)?.phone || "";
}

function phoneLink(value, fallback = "No mobile recorded") {
  const display = String(value || "").trim();
  const href = phoneHref(display);
  if (!href) return escapeHtml(fallback);
  return `<a class="phone-link" href="${escapeHtml(href)}" aria-label="Call ${escapeHtml(display)}">${escapeHtml(display)}</a>`;
}

function phoneHref(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const hasInternationalPrefix = text.startsWith("+");
  const digits = text.replace(/[^\d]/g, "");
  if (!digits) return "";
  return `tel:${hasInternationalPrefix ? "+" : ""}${digits}`;
}

function appointmentClinikoNote(appointment) {
  return String(appointment?.clinikoAppointmentNote || "").trim();
}

function appointmentReasonForReferral(appointment) {
  const referral = (state.data.referrals || []).find((item) => item.clientId === appointment.clientId);
  return appointment.reasonForReferral || referralReason(referral) || appointment.rebookReason || "";
}

function referralReason(referral) {
  return referral?.reasonForReferral || referral?.goals || referral?.notes || "";
}

function normalisedDetailText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function appointmentReasonDetailHtml(appointment, label = "Reason") {
  const clinikoNote = appointmentClinikoNote(appointment);
  let reason = appointmentReasonForReferral(appointment);
  if (clinikoNote && normalisedDetailText(reason) === normalisedDetailText(clinikoNote)) {
    const referral = (state.data.referrals || []).find((item) => item.clientId === appointment.clientId);
    reason = [referralReason(referral), appointment.rebookReason]
      .find((value) => value && normalisedDetailText(value) !== normalisedDetailText(clinikoNote)) || "";
    if (!reason) return "";
  }
  return `<div><strong>${escapeHtml(label)}</strong>${escapeHtml(reason || "Not recorded")}</div>`;
}

function clinikoAppointmentNoteDetailHtml(appointment, options = {}) {
  const note = appointmentClinikoNote(appointment);
  if (!note) return "";
  const value = options.compact ? truncateText(note, options.maxLength || 120) : note;
  return `<div class="cliniko-appointment-note"><strong>Cliniko note</strong>${escapeHtml(value)}</div>`;
}

function renderAppointmentClinikoNotePanel(appointment) {
  const note = appointmentClinikoNote(appointment);
  if (!note) return "";
  const rows = note
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const visibleRows = rows.length ? rows : [note];

  return `
    <section class="appointment-modal-cliniko-note" aria-label="Cliniko appointment note">
      <header>Cliniko appointment note</header>
      ${visibleRows.map((line) => `
        <div>
          <span></span>
          <p>${escapeHtml(line)}</p>
        </div>
      `).join("")}
    </section>
  `;
}

function clientNeedsRebook(client) {
  return !clientHasUpcomingAppointment(client.id) && !clientHasRebookStatus(client.id);
}

function clientHasUpcomingAppointment(clientId) {
  return state.data.appointments.some((appointment) =>
    appointment.clientId === clientId
    && !["cancelled", "no-show", "archived"].includes(appointment.status)
    && new Date(appointment.startsAt) > new Date()
  );
}

function nextAppointmentForClient(appointment) {
  const currentStart = new Date(appointment.startsAt);
  return sortAppointments(state.data.appointments.filter((item) =>
    item.id !== appointment.id
    && item.clientId === appointment.clientId
    && !["cancelled", "archived"].includes(item.status)
    && new Date(item.startsAt) > currentStart
  ))[0] || null;
}

function clientHasRebookStatus(clientId) {
  return state.data.rebookStatuses?.some((status) =>
    status.clientId === clientId && status.status === "sent_to_reception"
  );
}

function caseManagerForClient(client) {
  if (!client) return null;
  const direct = (state.data.caseManagers || []).find((item) => item.id === client.caseManagerId);
  if (direct) return direct;
  const referral = (state.data.referrals || []).find((item) => item.clientId === client.id);
  if (referral?.caseManagerId) {
    const fromReferral = (state.data.caseManagers || []).find((item) => item.id === referral.caseManagerId);
    if (fromReferral) return fromReferral;
  }
  return null;
}

function caseManagerLabel(caseManager) {
  return [caseManager.name, caseManager.organisation].filter(Boolean).join(" - ");
}

function caseManagerOptions(includeEmpty = false) {
  const options = (state.data.caseManagers || [])
    .map((caseManager) => [caseManager.id, caseManagerLabel(caseManager)]);
  return includeEmpty ? [["", "No case manager"], ...options] : options;
}

function caseManagerSelectionValue(referral) {
  return referral.caseManagerId || caseManagerFromReferral(referral)?.id || "";
}

function caseManagerProfilePatients(caseManagerId) {
  const seen = new Set();
  return (state.data.referrals || [])
    .map((referral) => {
      const client = (state.data.clients || []).find((item) => item.id === referral.clientId) || {};
      const manager = caseManagerFromReferral(referral, client);
      if (manager?.id !== caseManagerId || seen.has(referral.clientId)) return null;
      seen.add(referral.clientId);
      return { client, referral };
    })
    .filter(Boolean)
    .sort((a, b) => (a.client.name || a.referral.clientName || "").localeCompare(b.client.name || b.referral.clientName || ""));
}

function caseManagerContactLine(caseManager) {
  return [caseManager.mobile, caseManager.email].filter(Boolean).join(" | ") || "No contact details";
}

function companyReferralGroups() {
  const currentReferrals = (state.data.referrals || []).filter((referral) => !["discharged", "declined"].includes(referral.status));
  const groups = new Map();

  const ensureGroup = (company) => {
    const name = String(company || "No company selected").trim() || "No company selected";
    const key = name.toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, {
        company: name,
        managersMap: new Map(),
        clients: [],
        clientIds: new Set(),
        practitionerIds: new Set()
      });
    }
    return groups.get(key);
  };

  const ensureManager = (group, manager) => {
    const managerKey = manager?.id || String(manager?.name || "No case manager selected").trim().toLowerCase() || "no-case-manager";
    if (!group.managersMap.has(managerKey)) {
      group.managersMap.set(managerKey, {
        id: manager?.id || managerKey,
        name: manager?.name || "No case manager selected",
        contact: manager ? caseManagerContactLine(manager) : "",
        clients: [],
        clientIds: new Set()
      });
    }
    return group.managersMap.get(managerKey);
  };

  for (const caseManager of state.data.caseManagers || []) {
    const group = ensureGroup(caseManager.organisation || "No company selected");
    ensureManager(group, caseManager);
  }

  for (const referral of currentReferrals) {
    const client = state.data.clients.find((item) => item.id === referral.clientId) || {
      id: referral.clientId,
      name: referral.clientName,
      phone: referral.phone,
      fundingType: referral.fundingType
    };
    const manager = caseManagerFromReferral(referral, client);
    const fallbackManager = manager || {
      id: `unassigned-${String(referral.caseManager || "no-case-manager").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: String(referral.caseManager || "No case manager selected").trim() || "No case manager selected",
      organisation: "No company selected"
    };
    const group = ensureGroup(fallbackManager.organisation || "No company selected");
    const managerGroup = ensureManager(group, fallbackManager);
    const clientKey = client.id || referral.id;
    if (managerGroup.clientIds.has(clientKey)) continue;

    const item = { referral, client, manager };
    managerGroup.clientIds.add(clientKey);
    managerGroup.clients.push(item);
    if (referral.assignedContractorId) group.practitionerIds.add(referral.assignedContractorId);
    if (!group.clientIds.has(clientKey)) {
      group.clientIds.add(clientKey);
      group.clients.push(item);
    }
  }

  const groupsList = [...groups.values()].map((group) => ({
    company: group.company,
    practitionerIds: group.practitionerIds,
    clients: group.clients.sort((a, b) => String(a.client.name || a.referral.clientName || "").localeCompare(String(b.client.name || b.referral.clientName || ""))),
    managers: [...group.managersMap.values()]
      .map((manager) => ({
        id: manager.id,
        name: manager.name,
        contact: manager.contact,
        clients: manager.clients.sort((a, b) => String(a.client.name || a.referral.clientName || "").localeCompare(String(b.client.name || b.referral.clientName || "")))
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  })).sort((a, b) => {
    if (a.company === "No company selected") return 1;
    if (b.company === "No company selected") return -1;
    return a.company.localeCompare(b.company);
  });

  const search = state.search.trim().toLowerCase();
  if (!search) return groupsList;
  return groupsList
    .map((group) => {
      const managers = group.managers
        .map((manager) => ({
          ...manager,
          clients: manager.clients.filter((item) => companyReferralSearchText(group, manager, item).includes(search))
        }))
        .filter((manager) => manager.clients.length || [group.company, manager.name].join(" ").toLowerCase().includes(search));
      return {
        ...group,
        managers,
        clients: managers.flatMap((manager) => manager.clients),
        practitionerIds: new Set(managers.flatMap((manager) => manager.clients.map((item) => item.referral.assignedContractorId).filter(Boolean)))
      };
    })
    .filter((group) => group.managers.length || group.company.toLowerCase().includes(search));
}

function companyReferralSearchText(group, manager, item) {
  return [
    group.company,
    manager.name,
    item.client.name,
    item.referral.clientName,
    item.client.phone,
    item.referral.phone,
    item.client.fundingType,
    item.referral.fundingType,
    item.referral.status,
    userName(item.referral.assignedContractorId)
  ].filter(Boolean).join(" ").toLowerCase();
}

function caseManagerFromReferral(referral = {}, client = {}) {
  const caseManagers = state.data.caseManagers || [];
  if (referral.caseManagerId) {
    const direct = caseManagers.find((item) => item.id === referral.caseManagerId);
    if (direct) return direct;
  }
  if (client.caseManagerId) {
    const fromClient = caseManagers.find((item) => item.id === client.caseManagerId);
    if (fromClient) return fromClient;
  }
  const referralName = String(referral.caseManager || "").trim().toLowerCase();
  if (referralName) {
    return caseManagers.find((item) => String(item.name || "").trim().toLowerCase() === referralName) || null;
  }
  return null;
}

function caseManagerCompanies() {
  return [...new Set((state.data.caseManagers || [])
    .map((item) => String(item.organisation || "").trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function patientAppointments(clientId) {
  const appointments = [
    ...(state.data.appointments || []),
    ...(state.data.archivedAppointments || [])
  ].filter((appointment) => appointment.clientId === clientId);
  return [...new Map(appointments.map((appointment) => [appointment.id, appointment])).values()]
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
}

function patientAppointmentIsPrevious(appointment) {
  return new Date(appointment.startsAt) < new Date()
    || ["completed", "cancelled", "no-show", "archived"].includes(appointment.status);
}

function noteForAppointment(appointmentId) {
  return (state.data.treatmentNotes || []).find((note) => note.appointmentId === appointmentId);
}

function previousTreatmentNotesForAppointment(appointment) {
  const currentTime = new Date(appointment.startsAt || 0).getTime();
  const candidates = (state.data.treatmentNotes || [])
    .filter((note) => note.clientId === appointment.clientId && note.appointmentId !== appointment.id && note.status === "signed")
    .filter((note) => treatmentNoteHasCopyableFields(note, appointment))
    .map((note) => ({
      note,
      appointment: appointmentById(note.appointmentId)
    }))
    .sort((a, b) => {
      const aTime = new Date(a.appointment?.startsAt || a.note.updatedAt || a.note.createdAt || 0);
      const bTime = new Date(b.appointment?.startsAt || b.note.updatedAt || b.note.createdAt || 0);
      return bTime - aTime;
    });

  const earlierNotes = candidates.filter(({ note, appointment: noteAppointment }) => {
    const noteTime = new Date(noteAppointment?.startsAt || note.updatedAt || note.createdAt || 0).getTime();
    return Number.isFinite(noteTime) && Number.isFinite(currentTime) && noteTime < currentTime;
  });

  return earlierNotes.length ? earlierNotes : candidates;
}

function treatmentNoteHasCopyableFields(note, appointment) {
  const fields = note.fields || {};
  return editableTreatmentNoteFieldKeys(appointment).some((key) => String(fields[key] || "").trim());
}

function editableTreatmentNoteFieldKeys(appointment) {
  if (isInitialPhysioAssessment(appointment)) {
    return [
      "reasonForReferral",
      "medicalHistory",
      "currentHomeSetUp",
      "subjective",
      "objectiveObservations",
      "customOutcomeMeasures",
      "assessment",
      "treatment",
      "recommendations",
      "plan"
    ];
  }

  return state.data.noteTemplates[appointment.serviceType || state.data.currentUser.discipline]
    || state.data.noteTemplates["Physiotherapy"]
    || [];
}

function patientCompletedWork(clientId) {
  return [...patientCompletedNotes(clientId), ...patientCompletedReports(clientId)]
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

function patientCompletedNotes(clientId) {
  return (state.data.treatmentNotes || [])
    .filter((note) => note.clientId === clientId && note.status === "signed")
    .map((note) => {
      const appointment = appointmentById(note.appointmentId);
      return {
        kind: "note",
        id: note.id,
        appointmentId: note.appointmentId,
        title: "Notes completed",
        status: "Notes completed",
        summary: "Notes completed",
        appointmentDate: appointment?.startsAt || note.updatedAt || note.createdAt,
        date: appointment?.startsAt || note.updatedAt || note.createdAt
      };
    });
}

function patientCompletedReports(clientId) {
  return (state.data.reports || [])
    .filter((report) => report.clientId === clientId && ["ready_for_admin", "final"].includes(report.status))
    .map((report) => ({
      kind: "report",
      id: report.id,
      appointmentId: report.appointmentId || "",
      title: report.type || "Report",
      status: reportStatusLabel(report.status),
      summary: report.summary || "Report ready for admin review.",
      date: report.adminCopySentAt || report.updatedAt || report.createdAt
    }))
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

function appointmentById(id) {
  return [...(state.data.appointments || []), ...(state.data.archivedAppointments || [])]
    .find((appointment) => appointment.id === id);
}

function noteSummary(note) {
  const fields = note.fields || {};
  const text = fields.assessment
    || fields.treatment
    || fields.plan
    || fields.subjective
    || fields.objective
    || fields.objectiveObservations
    || "";
  return truncateText(text, 160) || "Signed treatment note.";
}

function patientClientAddress(clientId) {
  return state.data.clients.find((client) => client.id === clientId)?.address || "";
}

function googleMapsDirectionsUrl(address) {
  const destination = String(address || "").trim();
  if (!destination) return "";
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

function renderDirectionsLink(address, label = "Directions") {
  const url = googleMapsDirectionsUrl(address);
  if (!url) return "";
  return `<a class="button secondary directions-link" target="_blank" rel="noreferrer" href="${url}">${escapeHtml(label)}</a>`;
}

function pollingIntervalLabel(clinikoConfig) {
  if (!clinikoConfig?.pollEnabled) return "polling off";
  if (clinikoConfig.pollingIntervalSeconds) return `${clinikoConfig.pollingIntervalSeconds}s polling`;
  return `${clinikoConfig.pollingIntervalMinutes || 5}m polling`;
}

function appointmentActionStatuses() {
  return state.data.appointmentStatuses.filter((status) => !["pending_approval", "booked", "confirmed"].includes(status));
}

function appointmentStatusButtonClass(appointment, status) {
  return appointment.status === status ? "" : "secondary";
}

function appointmentStatusLabel(status) {
  return {
    pending_approval: "pending approval",
    booked: "booked",
    confirmed: "confirmed",
    completed: "completed",
    cancelled: "cancelled",
    archived: "archived",
    rescheduled: "rescheduled",
    "no-show": "no-show"
  }[status] || String(status || "").replaceAll("_", " ");
}

function appointmentStatusTone(status) {
  return {
    pending_approval: "gold",
    booked: "blue",
    confirmed: "blue",
    cancelled: "coral",
    archived: "coral",
    rescheduled: "gold",
    "no-show": "coral"
  }[status] || "";
}

function appointmentNotesComplete(appointment) {
  return state.data.treatmentNotes.some((note) =>
    note.appointmentId === appointment.id && note.status === "signed"
  );
}

function appointmentNotesDue(appointment) {
  return !["cancelled", "archived"].includes(appointment.status)
    && appointmentRequiresTreatmentNote(appointment)
    && !appointmentNotesComplete(appointment);
}

function appointmentReportDue(appointment) {
  if (["cancelled", "archived"].includes(appointment.status)) return false;
  if (!appointmentRequiresReport(appointment)) return false;

  const report = exactReportForAppointment(appointment);
  const completedReport = report && reportIsCompletedForAdmin(report);

  return !completedReport;
}

function appointmentRequiresReport(appointment) {
  return isInitialPhysioReportAppointment(appointment) || isEquipmentTrialReportAppointment(appointment);
}

function appointmentClinicalActions(appointment) {
  const report = exactReportForAppointment(appointment);
  const note = noteForAppointment(appointment.id);
  const showReport = appointmentRequiresReport(appointment);
  const showTreatmentNote = appointmentRequiresTreatmentNote(appointment);
  const isRecognisedClinicalType = showReport || showTreatmentNote;

  return {
    showReport: showReport || !isRecognisedClinicalType,
    showTreatmentNote: showTreatmentNote || !isRecognisedClinicalType,
    reportLabel: report ? "Open report" : "Start report",
    noteLabel: note?.status === "signed" ? "View notes" : note ? "Continue notes" : "Start notes"
  };
}

function isInitialPhysioAssessment(appointment) {
  return isInitialPhysioReportAppointment(appointment);
}

function appointmentRequiresTreatmentNote(appointment) {
  return isSubsequentPhysioTreatmentNoteAppointment(appointment);
}

function isInitialPhysioReportAppointment(appointment) {
  return appointmentMatchesPhysioFundingType(appointment, "initial");
}

function isSubsequentPhysioTreatmentNoteAppointment(appointment) {
  return appointmentMatchesPhysioFundingType(appointment, "subsequent");
}

function isEquipmentTrialReportAppointment(appointment) {
  return appointmentBookingText(appointment).includes("equipment");
}

function appointmentMatchesPhysioFundingType(appointment, visitStage) {
  const bookingType = appointmentBookingText(appointment);
  const isPhysio = appointment.serviceType === "Physiotherapy" || bookingType.includes("physio");
  return isPhysio
    && bookingType.includes(visitStage)
    && (bookingType.includes("sah") || bookingType.includes("chsp"));
}

function appointmentBookingText(appointment) {
  return [
    appointment.appointmentType,
    appointment.recurrence,
    appointment.serviceType,
    appointment.type,
    appointment.clinikoAppointmentType,
    appointment.clinikoAppointmentTypeName
  ].filter(Boolean).join(" ").toLowerCase();
}

function selectedOutcomeMeasuresForAppointment(appointmentId, fields) {
  if (state.noteOutcomeMeasures[appointmentId]) return state.noteOutcomeMeasures[appointmentId];
  return normalizeFieldArray(fields.outcomeMeasures);
}

function selectedOutcomeMeasureInputs(root = document) {
  return [...root.querySelectorAll("input[name='field_outcomeMeasures']:checked")]
    .map((input) => input.value)
    .filter(Boolean);
}

function outcomeMeasureContextKey() {
  const reportForm = document.querySelector("#report-form");
  if (reportForm) {
    const appointmentId = reportForm.querySelector("input[name='appointmentId']")?.value || "";
    const type = reportForm.querySelector("select[name='type']")?.value || state.reportType;
    return `report-${reportDraftKey(appointmentId, type)}`;
  }
  return state.activeAppointmentId || "note";
}

function updateOutcomeMeasureOutputs(selectedMeasures, fields) {
  const customMeasures = customOutcomeMeasuresFromFields(fields);
  const allMeasures = outcomeMeasureRows(selectedMeasures, customMeasures);
  const tableWrap = document.querySelector("#outcome-measure-table-wrap");
  const valuesWrap = document.querySelector("#normative-values-wrap");
  if (tableWrap) tableWrap.innerHTML = renderOutcomeMeasureTable(allMeasures, fields);
  if (valuesWrap) valuesWrap.innerHTML = renderNormativeValues(allMeasures);
}

function outcomeMeasureRows(selectedMeasures, customMeasures = []) {
  const standardRows = selectedMeasures
    .filter((id) => id !== "other")
    .map(outcomeMeasureById);
  return [...standardRows, ...customMeasures];
}

function customOutcomeMeasuresFromFields(fields = {}) {
  return String(fields.customOutcomeMeasures || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((label, index) => ({
      id: `custom_${slugify(label)}_${index + 1}`,
      label,
      reference: "Custom measure. Add the relevant normative value, cut-off, or clinical interpretation in the clinical note."
    }));
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    || "measure";
}

function normalizeFieldArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return [value];
}

function outcomeMeasureById(id) {
  return physioOutcomeMeasures.find((measure) => measure.id === id) || {
    id,
    label: id,
    reference: "No reference value recorded."
  };
}

function reportForAppointment(appointment) {
  const expectedType = reportTypeForAppointment(appointment);
  return state.data.reports.find((report) => report.appointmentId === appointment.id)
    || state.data.reports.find((report) =>
      !report.appointmentId
      && expectedType
      && report.clientId === appointment.clientId
      && report.contractorId === appointment.contractorId
      && report.type === expectedType
    );
}

function exactReportForAppointment(appointment) {
  return state.data.reports.find((report) => report.appointmentId === appointment.id);
}

function noteDaysOverdue(appointment) {
  const todayKey = dateKeyFromParts(brisbaneParts(new Date()));
  const appointmentKey = brisbaneDateKey(appointment.startsAt);
  return Math.max(0, Math.floor((dateKeyToUtcMs(todayKey) - dateKeyToUtcMs(appointmentKey)) / 86400000));
}

function noteDueAgeLabel(appointment) {
  const days = noteDaysOverdue(appointment);
  if (days === 0) return "Due today";
  return `${days} day${days === 1 ? "" : "s"} overdue`;
}

function reportDueDateKey(appointment) {
  return addDaysToDateKey(brisbaneDateKey(appointment.startsAt), 2);
}

function reportDueBucket(appointment) {
  const todayKey = dateKeyFromParts(brisbaneParts(new Date()));
  const dueKey = reportDueDateKey(appointment);

  if (todayKey < dueKey) return "upcoming";
  if (todayKey > dueKey) return "overdue";
  return "today";
}

function reportDueAgeLabel(appointment) {
  const todayKey = dateKeyFromParts(brisbaneParts(new Date()));
  const dueKey = reportDueDateKey(appointment);
  const dayGap = Math.floor((dateKeyToUtcMs(dueKey) - dateKeyToUtcMs(todayKey)) / 86400000);

  if (dayGap < 0) {
    const overdueDays = Math.abs(dayGap);
    return `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`;
  }

  if (dayGap === 0) return "Due today";
  if (dayGap === 1) return "Due tomorrow";
  return `Due in ${dayGap} days`;
}

function dateKeyToUtcMs(key) {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function addDaysToDateKey(key, days) {
  const date = new Date(dateKeyToUtcMs(key) + days * 86400000);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function addMonthsToDateKey(key, months) {
  const parts = datePartsFromKey(key);
  const date = new Date(Date.UTC(parts.year, parts.month - 1 + months, parts.day));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function dueBucket(appointment) {
  const todayKey = dateKeyFromParts(brisbaneParts(new Date()));
  const appointmentKey = brisbaneDateKey(appointment.startsAt);
  if (appointmentKey < todayKey) return "overdue";
  if (appointmentKey === todayKey) return "today";
  return "upcoming";
}

function dueBucketLabel(appointment) {
  return {
    overdue: "Overdue",
    today: "Due today",
    upcoming: "Upcoming"
  }[dueBucket(appointment)];
}

function reportStatusLabel(status) {
  return {
    not_started: "Not started",
    draft: "Draft",
    ready_for_admin: "Ready for admin",
    final: "Final"
  }[status] || "Draft";
}

function roleLabel(role) {
  return {
    admin: "Admin",
    receptionist: "Receptionist",
    contractor: "Practitioner"
  }[role] || "Staff";
}

function reportTone(status) {
  return {
    not_started: "coral",
    draft: "gold",
    ready_for_admin: "blue",
    final: ""
  }[status] || "gold";
}

function sortApprovalRequests(requests) {
  return [...requests].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}

function activeApprovalRequests(requests) {
  return sortApprovalRequests(requests).filter((request) => !["approved", "declined"].includes(request.status));
}

function approvalStatusLabel(status, options = {}) {
  if (options.sentLabel && ["pending", "waiting"].includes(status)) return "Approval sent";
  return {
    pending: "Currently waiting for approval",
    waiting: "Currently waiting for approval",
    approved: "Approved",
    declined: "Declined"
  }[status] || "Currently waiting for approval";
}

function inboxStatusLabel(status) {
  return {
    new: "New",
    in_progress: "In progress",
    waiting: "Waiting",
    resolved: "Resolved",
    closed: "Closed"
  }[status] || "New";
}

function inboxTone(status) {
  return {
    new: "gold",
    in_progress: "blue",
    waiting: "gold",
    resolved: "",
    closed: ""
  }[status] || "gold";
}

function inboxSourceLabel(sourceType) {
  return {
    approval_request: "approval request",
    rebook_status: "rebook status",
    referral: "new referral",
    report_copy: "report for review",
    running_late: "running late"
  }[sourceType] || "workflow";
}

function notificationTypeLabel(type) {
  return {
    report_reminder: "Report reminder",
    approval_result: "Approval update",
    appointment_rebooked: "Rebooking update",
    new_patient_booked: "New patient booking",
    new_referral_assigned: "New referral",
    report_copy: "Report copy",
    case_manager_report_sent: "Case manager report",
    rebook_status: "Rebook status",
    approval_request: "Approval request",
    running_late: "Running late",
    direct_message: "Direct message"
  }[type] || String(type || "Admin message").replaceAll("_", " ");
}

function approvalResultMessage(status) {
  return {
    waiting: "Admin is waiting for case-manager approval.",
    approved: "Case-manager approval has been received.",
    declined: "Case-manager approval was declined."
  }[status] || "Approval status updated.";
}

function input(name, label, type = "text", required = false, className = "", value = "") {
  return `<label class="${className}">
    ${escapeHtml(label)}
    <input name="${name}" type="${type}" value="${escapeHtml(value)}" ${required ? "required" : ""}>
  </label>`;
}

function companyInput(name, label, value = "", className = "") {
  return `<label class="${className}">
    ${escapeHtml(label)}
    <input name="${name}" type="text" value="${escapeHtml(value)}" list="case-manager-company-options" placeholder="Choose or type company">
  </label>`;
}

function renderCompanyDatalist() {
  const companies = caseManagerCompanies();
  return `<datalist id="case-manager-company-options">
    ${companies.map((company) => `<option value="${escapeHtml(company)}"></option>`).join("")}
  </datalist>`;
}

function textarea(name, label, className = "", value = "") {
  return `<label class="${className}">
    ${escapeHtml(label)}
    <textarea name="${name}">${escapeHtml(value)}</textarea>
  </label>`;
}

function aiTextarea(name, label, className = "", value = "", sectionType = "") {
  const id = `ai-${String(name).replace(/[^a-z0-9_-]/gi, "-")}`;
  const aiSectionType = sectionType || fieldKey(label);
  return `<label class="${className} ai-textarea-field" for="${id}">
    <span class="ai-field-header">
      <span>${escapeHtml(label)}</span>
      <button type="button" class="secondary ai-polish-button" data-action="ai-polish-section" data-target="${escapeHtml(id)}" data-section-type="${escapeHtml(aiSectionType)}" data-section-label="${escapeHtml(label)}">Polish with AI</button>
    </span>
    <textarea id="${id}" name="${name}" data-ai-section="${escapeHtml(aiSectionType)}" data-ai-label="${escapeHtml(label)}">${escapeHtml(value)}</textarea>
  </label>`;
}

function select(name, label, options, selected = "", className = "", id = "", extra = "") {
  return `<label class="${className}">
    ${escapeHtml(label)}
    <select name="${name}" ${id ? `id="${id}"` : ""} ${extra}>
      ${options.map((option) => {
        const value = Array.isArray(option) ? option[0] : option;
        const text = Array.isArray(option) ? option[1] : option;
        return `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(text)}</option>`;
      }).join("")}
    </select>
  </label>`;
}

function statusPill(text, tone = "") {
  return `<span class="pill ${tone}">${escapeHtml(String(text || ""))}</span>`;
}

function emptyState(text) {
  return `<div class="empty-state">${escapeHtml(text)}</div>`;
}

function clientName(id) {
  return state.data.clients.find((client) => client.id === id)?.name || "Unknown client";
}

function userName(id) {
  return state.data.users.find((user) => user.id === id)?.name || "Unknown user";
}

function professionalTitleForUser(user = {}) {
  const discipline = String(user.discipline || "").trim();
  if (!discipline || discipline.toLowerCase() === "physiotherapy") return "Physiotherapist";
  return discipline;
}

function truncateText(value, maxLength) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function formatAppointmentLabel(id) {
  const appointment = state.data.appointments.find((item) => item.id === id);
  if (!appointment) return "Unknown appointment";
  return `${clientName(appointment.clientId)} - ${formatDateTime(appointment.startsAt)}`;
}

function formatDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatAppointmentDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(value));
}

function formatTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function fieldKey(label) {
  return label
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function labelFromKey(key) {
  return String(key)
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function offlineKey(appointmentId) {
  return `refine-note-draft-${appointmentId}`;
}

function getOfflineDraft(appointmentId) {
  const raw = localStorage.getItem(offlineKey(appointmentId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toast(message) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const element = document.createElement("div");
  element.className = "toast";
  element.textContent = message;
  document.body.appendChild(element);
  window.setTimeout(() => element.remove(), 2600);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
