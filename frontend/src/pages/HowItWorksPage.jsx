import { Link } from "react-router-dom";

const STEPS = [
  {
    number: "01",
    title: "Create Your Event",
    description:
      "Click Get Started to generate your unique organizer code. Then open your dashboard and create your event by entering the event name, date, and location. Choose how many tickets you want and generate your QR code tickets instantly.",
    image: "/how-it-works/step-1-create-event.png",
    imageAlt: "Dashboard event creation area",
  },
  {
    number: "02",
    title: "Approve and Send Tickets",
    description:
      "Share your event with customers and collect payment using any method you prefer. Once payment is received, approve the tickets inside the dashboard. The system will automatically send the tickets to your customers.",
    image: "/how-it-works/step-2-ticket-management.png",
    imageAlt: "Dashboard ticket management area",
  },
  {
    number: "03",
    title: "Scan Tickets at the Event",
    description:
      "Open the scanner when guests arrive. Scan each ticket's QR code and the system will instantly verify if the ticket is valid. Duplicate or invalid tickets will be detected automatically.",
    image: "/how-it-works/step-3-scan-verify.png",
    imageAlt: "Scanner showing ticket verification",
  },
];

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen w-full bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 text-slate-900">
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <header className="mx-auto max-w-3xl text-center">
          <h1 className="text-[2rem] font-semibold leading-tight text-slate-800 sm:text-[2.1rem]">How It Works</h1>
          <p className="mt-3 text-[1rem] leading-relaxed text-slate-500">
            Create, send, and scan QR tickets in three simple steps.
          </p>
        </header>

        <section className="mt-10 space-y-10 sm:mt-12 sm:space-y-12">
          {STEPS.map((step) => (
            <article
              key={step.number}
              className="grid grid-cols-1 items-center gap-6 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm sm:p-5 md:grid-cols-2 md:gap-8"
            >
              <div className="flex justify-center">
                <img
                  src={step.image}
                  alt={step.imageAlt}
                  className="w-full max-w-[580px] rounded-2xl border border-slate-200 shadow-md"
                  loading="lazy"
                />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-[0.14em] text-slate-500">STEP {step.number}</p>
                <h2 className="mt-2 text-[1.2rem] font-semibold leading-snug text-slate-800">{step.title}</h2>
                <p className="mt-3 text-[0.95rem] leading-relaxed text-slate-600">{step.description}</p>
              </div>
            </article>
          ))}
        </section>

        <div className="mt-12 text-center">
          <Link
            to="/"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-black px-7 text-sm font-semibold text-white transition-colors hover:bg-slate-900"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
