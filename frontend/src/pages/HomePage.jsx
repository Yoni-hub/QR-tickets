import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import AppButton from "../components/ui/AppButton";
import FeedbackBanner from "../components/ui/FeedbackBanner";
import { withMinDelay } from "../lib/withMinDelay";

const FEATURE_CARDS = [
  {
    id: "generation",
    icon: "/easy-Ticket.png",
    iconAlt: "Easy ticket generation",
    title: "Easy Ticket Generation",
    description: "Quickly create custom QR code tickets.",
    steps: [
      {
        title: "Create Your Event",
        image: "/how-it-works/step-1-create-event.png",
        imageAlt: "Create event dashboard screenshot",
        text: "Enter the event name, date, and location.",
      },
      {
        title: "Generate QR Tickets",
        image: "/how-it-works/step-2-ticket-management.png",
        imageAlt: "Ticket generation screenshot",
        text: "Choose how many tickets you want and generate them instantly.",
      },
      {
        title: "Send Tickets to Customers",
        image: "/how-it-works/ticket-delivery.jpeg",
        imageAlt: "Ticket delivery screenshot",
        text: "Send tickets by email, download them as PDF, or share your event link.",
      },
    ],
  },
  {
    id: "scanning",
    icon: "/qr_scan.png",
    iconAlt: "Fast QR code scanning",
    title: "Fast QR Code Scanning",
    description: "Instantly scan and verify tickets with your phone.",
    steps: [
      {
        title: "Open the Scanner",
        image: "/how-it-works/scanner-page.jpeg",
        imageAlt: "Scanner page screenshot",
        text: "Open the scanner when guests arrive.",
      },
      {
        title: "Scan the Ticket",
        image: "/how-it-works/qr-ticket.jpeg",
        imageAlt: "Ticket verification screenshot",
        text: "Scan the QR code using your phone.",
      },
      {
        title: "Instant Verification",
        image: "/how-it-works/step-3-scan-verify.png",
        imageAlt: "Valid ticket result screenshot",
        text: "The system instantly confirms valid tickets and blocks duplicates.",
      },
    ],
  },
];

const HERO_SLIDES = [
  {
    image: "/how-it-works/step-1-create-event.png",
    imageAlt: "Dashboard event creation screenshot",
  },
  {
    image: "/how-it-works/step-2-ticket-management.png",
    imageAlt: "Ticket management screenshot",
  },
  {
    image: "/how-it-works/ticket-delivery.jpeg",
    imageAlt: "Ticket delivery screenshot",
  },
];

const HERO_START_SLIDE_INDEX = 1;
const HERO_LOOP_COUNT = 3;
const HERO_TIMELINE_OFFSETS = Array.from(
  { length: HERO_SLIDES.length * HERO_LOOP_COUNT * 2 + 1 },
  (_, index) => index - HERO_SLIDES.length * HERO_LOOP_COUNT,
);

export default function HomePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState({ kind: "", message: "" });
  const [result, setResult] = useState(null);
  const [activeGuideId, setActiveGuideId] = useState("");
  const [activeGuideStep, setActiveGuideStep] = useState(0);
  const [heroTimelineIndex, setHeroTimelineIndex] = useState(HERO_SLIDES.length * HERO_LOOP_COUNT);
  const [heroAutoPlayEnabled, setHeroAutoPlayEnabled] = useState(true);
  const [heroControlsVisible, setHeroControlsVisible] = useState(false);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const heroTouchStartRef = useRef({ x: 0, y: 0 });
  const heroControlsTimeoutRef = useRef(null);

  const getStarted = async () => {
    if (loading) return;
    setLoading(true);
    setFeedback({ kind: "", message: "" });
    setResult(null);
    try {
      const response = await withMinDelay(
        api.post("/demo/events", {
          generateAccessOnly: true,
          eventName: "QR Tickets Demo Event",
          eventAddress: "Sample Venue",
          eventDateTime: new Date().toISOString(),
          dateTimeText: new Date().toLocaleString(),
          ticketType: "General",
          ticketPrice: "0",
          quantity: "10",
        }),
      );
      setResult(response.data);
      setFeedback({ kind: "success", message: "Organizer access code generated." });
    } catch (requestError) {
      setFeedback({
        kind: "error",
        message: requestError.response?.data?.error || "Could not generate organizer access code.",
      });
    } finally {
      setLoading(false);
    }
  };

  const closeGuide = () => {
    setActiveGuideId("");
    setActiveGuideStep(0);
  };

  const showHeroControls = () => {
    setHeroControlsVisible(true);
    if (heroControlsTimeoutRef.current) {
      window.clearTimeout(heroControlsTimeoutRef.current);
    }
    heroControlsTimeoutRef.current = window.setTimeout(() => {
      setHeroControlsVisible(false);
      heroControlsTimeoutRef.current = null;
    }, 3000);
  };

  useEffect(() => {
    if (!heroAutoPlayEnabled) return undefined;

    const intervalId = window.setInterval(() => {
      setHeroTimelineIndex((current) => {
        const nextIndex = Math.min(HERO_TIMELINE_OFFSETS.length - 1, current + 1);
        if (nextIndex >= HERO_TIMELINE_OFFSETS.length - 1) {
          setHeroAutoPlayEnabled(false);
        }
        return nextIndex;
      });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [heroAutoPlayEnabled]);

  useEffect(() => {
    return () => {
      if (heroControlsTimeoutRef.current) {
        window.clearTimeout(heroControlsTimeoutRef.current);
      }
    };
  }, []);

  const heroAtStart = heroTimelineIndex <= 0;
  const heroAtEnd = heroTimelineIndex >= HERO_TIMELINE_OFFSETS.length - 1;

  return (
    <main className="min-h-screen w-full bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 text-slate-900">
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between border-b border-slate-200 pb-4">
          <a href="#" className="text-base font-semibold tracking-[0.08em] text-slate-900 sm:text-lg">
            QR Ticket by Connsura
          </a>
        </header>

        <section
          className="relative mt-8 overflow-hidden px-5 py-7 sm:px-8"
          style={{
            backgroundImage:
              "radial-gradient(circle at top left, rgba(255,255,255,0.92) 0%, rgba(248,250,252,0.9) 45%, rgba(226,232,240,0.72) 100%), linear-gradient(135deg, rgba(255,255,255,0.4), rgba(241,245,249,0.2))",
          }}
        >
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">No signup required</p>
            <h1 className="mt-4 text-[2.35rem] font-semibold leading-[1.08] text-slate-900 sm:text-[3.15rem]">
              Create QR Code Tickets Instantly
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-[1.06rem]">
              Create QR tickets, send them to customers, and scan them at your event.
            </p>
            <div className="mt-7 flex justify-center">
              <AppButton
                onClick={getStarted}
                loading={loading}
                loadingText="Starting..."
                className="h-11 min-w-[190px] rounded-lg bg-black px-7 text-[0.95rem] font-semibold text-white shadow-md transition-transform hover:scale-[1.01] hover:bg-slate-900"
              >
                Get Started
              </AppButton>
            </div>
          </div>

          <div className="mx-auto mt-8 max-w-[900px]">
            <div
              className="relative overflow-hidden bg-transparent"
              onClick={showHeroControls}
              onTouchStart={(event) => {
                showHeroControls();
                const touch = event.touches[0];
                heroTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
              }}
              onTouchEnd={(event) => {
                const touch = event.changedTouches[0];
                const deltaX = touch.clientX - heroTouchStartRef.current.x;
                const deltaY = touch.clientY - heroTouchStartRef.current.y;
                const isHorizontalSwipe = Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY);

                if (!isHorizontalSwipe) return;
                if (deltaX < 0) {
                  setHeroAutoPlayEnabled(false);
                  setHeroTimelineIndex((current) => Math.min(HERO_TIMELINE_OFFSETS.length - 1, current + 1));
                  return;
                }
                setHeroAutoPlayEnabled(false);
                setHeroTimelineIndex((current) => Math.max(0, current - 1));
              }}
            >
              <div
                className="flex transition-transform duration-700 ease-in-out"
                style={{ transform: `translateX(-${heroTimelineIndex * 100}%)` }}
              >
                {HERO_TIMELINE_OFFSETS.map((offset) => {
                  const slideIndex =
                    ((HERO_START_SLIDE_INDEX + offset) % HERO_SLIDES.length + HERO_SLIDES.length) % HERO_SLIDES.length;
                  const slide = HERO_SLIDES[slideIndex];

                  return (
                  <div key={`${slide.image}-${offset}`} className="flex h-[260px] w-full shrink-0 items-center justify-center bg-transparent sm:h-[320px]">
                    <img
                      src={slide.image}
                      alt={slide.imageAlt}
                      className="h-full w-full scale-[0.98] object-contain object-center"
                    />
                  </div>
                  );
                })}
              </div>
              <div className={`pointer-events-none absolute inset-y-0 left-3 flex items-center transition-opacity duration-200 ${heroControlsVisible ? "opacity-100" : "opacity-0"}`}>
                  <button
                    type="button"
                    onClick={() => {
                      showHeroControls();
                      setHeroAutoPlayEnabled(false);
                      setHeroTimelineIndex((current) => Math.max(0, current - 1));
                    }}
                    disabled={heroAtStart}
                    className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white/95 text-sm text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35"
                    aria-label="Previous hero image"
                  >
                  &lt;
                </button>
              </div>
              <div className={`pointer-events-none absolute inset-y-0 right-3 flex items-center transition-opacity duration-200 ${heroControlsVisible ? "opacity-100" : "opacity-0"}`}>
                  <button
                    type="button"
                    onClick={() => {
                      showHeroControls();
                      setHeroAutoPlayEnabled(false);
                      setHeroTimelineIndex((current) => {
                        const nextIndex = Math.min(HERO_TIMELINE_OFFSETS.length - 1, current + 1);
                        return nextIndex;
                      });
                    }}
                    disabled={heroAtEnd}
                    className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white/95 text-sm text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35"
                    aria-label="Next hero image"
                  >
                  &gt;
                </button>
              </div>
            </div>
          </div>

          <FeedbackBanner className="mx-auto mt-5 max-w-xl text-left" kind={feedback.kind} message={feedback.message} />

          {result?.organizerAccessCode ? (
            <section className="mx-auto mt-6 max-w-xl rounded-2xl border border-blue-100 bg-white/95 p-4 text-left shadow-sm">
              <p className="text-sm text-slate-600">Organizer access code</p>
              <p className="break-all text-3xl font-bold tracking-wider text-slate-900">{result.organizerAccessCode}</p>
              <p className="mt-2 text-sm text-blue-700">
                Organizer access code generated. Go to Dashboard to manage your events.
              </p>
              <p className="mt-2 text-sm text-amber-700">
                Save this code now. If you lose it, you cannot recover your events. Do not share it with anyone.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                <AppButton variant="indigo" onClick={() => navigate(`/dashboard?code=${encodeURIComponent(result.organizerAccessCode)}`)}>
                  Go to Dashboard
                </AppButton>
              </div>
            </section>
          ) : null}
        </section>

        <div className="mt-8 border-t border-slate-200" />

        <section id="how-it-works" className="mt-10 grid gap-4 md:grid-cols-2">
          {FEATURE_CARDS.map((card) => {
            const isActive = activeGuideId === card.id;

            return (
              <article key={card.id} className="min-h-[270px] [perspective:1400px] sm:min-h-[280px]">
                <div
                  className="relative h-full w-full transition-transform duration-300 [transform-style:preserve-3d]"
                  style={{ transform: isActive ? "rotateY(180deg)" : "rotateY(0deg)" }}
                >
                  <div className="absolute inset-0 rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm [backface-visibility:hidden]">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveGuideId(card.id);
                        setActiveGuideStep(0);
                      }}
                      className="flex h-full w-full flex-col items-center justify-center text-center"
                    >
                      <img src={card.icon} alt={card.iconAlt} className="mx-auto h-48 w-48 rounded-xl object-contain" />
                      <h2 className="mt-1 text-[1rem] font-semibold leading-[1.25] text-slate-800">{card.title}</h2>
                      <p className="mx-auto mt-1 max-w-sm text-[0.85rem] leading-5 text-slate-600">
                        {card.description}
                      </p>
                    </button>
                  </div>

                  <div
                    className="absolute inset-0 flex cursor-pointer flex-col rounded-2xl border border-slate-200 bg-white/88 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.08)] [backface-visibility:hidden]"
                    style={{ transform: "rotateY(180deg)" }}
                    onClick={closeGuide}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          closeGuide();
                        }}
                        className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                      >
                        Back
                      </button>
                      <p className="text-right text-sm font-semibold text-slate-500">{card.title}</p>
                    </div>

                    <div
                      className="mt-2 min-h-0 flex-1 overflow-hidden"
                      onTouchStart={(event) => {
                        const touch = event.touches[0];
                        touchStartRef.current = { x: touch.clientX, y: touch.clientY };
                      }}
                      onTouchEnd={(event) => {
                        const touch = event.changedTouches[0];
                        const deltaX = touch.clientX - touchStartRef.current.x;
                        const deltaY = touch.clientY - touchStartRef.current.y;
                        const isHorizontalSwipe = Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY);

                        if (!isHorizontalSwipe) return;
                        if (deltaX < 0) {
                          setActiveGuideStep((current) => Math.min(card.steps.length - 1, current + 1));
                          return;
                        }
                        setActiveGuideStep((current) => Math.max(0, current - 1));
                      }}
                    >
                      <div
                        className="flex h-full transition-transform duration-300 ease-out"
                        style={{
                          transform: `translateX(-${(isActive ? activeGuideStep : 0) * 100}%)`,
                        }}
                      >
                        {card.steps.map((step, index) => (
                          <div key={step.title} className="h-full w-full shrink-0 px-1">
                            <div className="flex h-full flex-col p-1 text-center">
                              <div className="relative flex h-[118px] items-center justify-center overflow-hidden rounded-xl bg-white/90 p-1.5 sm:h-[126px]">
                                <img
                                  src={step.image}
                                  alt={step.imageAlt}
                                  className="h-full w-full rounded-lg object-contain"
                                  loading="lazy"
                                />
                                <div className="absolute inset-y-0 left-2 flex items-center">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setActiveGuideStep((current) => Math.max(0, current - 1));
                                    }}
                                    disabled={!isActive || activeGuideStep === 0}
                                    className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/95 text-xs text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35"
                                    aria-label="Previous step"
                                  >
                                    &lt;
                                  </button>
                                </div>
                                <div className="absolute inset-y-0 right-2 flex items-center">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setActiveGuideStep((current) => Math.min(card.steps.length - 1, current + 1));
                                    }}
                                    disabled={!isActive || activeGuideStep === card.steps.length - 1}
                                    className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/95 text-xs text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35"
                                    aria-label="Next step"
                                  >
                                    &gt;
                                  </button>
                                </div>
                              </div>
                              <p className="mt-2 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                Step {index + 1}
                              </p>
                              <h3 className="mt-1 text-[0.9rem] font-semibold text-slate-900">
                                {step.title}
                              </h3>
                              <p className="mx-auto mt-1 max-w-xl text-[0.78rem] leading-4 text-slate-600">
                                {step.text}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <section className="mt-12 rounded-[1.8rem] border border-slate-200 bg-white/80 px-5 py-10 text-center shadow-sm sm:px-8">
          <h2 className="text-[2rem] font-semibold leading-tight text-slate-900">Ready to create your event?</h2>
          <p className="mx-auto mt-4 max-w-2xl text-[1rem] leading-7 text-slate-600">
            Create QR tickets and start scanning in seconds.
          </p>
          <div className="mt-7 flex justify-center">
            <AppButton
              onClick={getStarted}
              loading={loading}
              loadingText="Starting..."
              className="h-12 min-w-[210px] rounded-lg bg-black px-8 text-[1rem] font-semibold text-white shadow-md transition-transform hover:scale-[1.01] hover:bg-slate-900"
            >
              Get Started
            </AppButton>
          </div>
        </section>

        <footer className="mx-auto mt-10 max-w-5xl border-t border-slate-200 pt-6 text-center text-sm text-slate-500">
          Need help? Support is available from the dashboard once you start your event.
        </footer>
      </div>
    </main>
  );
}
