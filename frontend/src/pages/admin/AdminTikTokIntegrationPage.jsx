import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AppButton from "../../components/ui/AppButton";
import LoadingState from "../../components/admin/LoadingState";
import ErrorState from "../../components/admin/ErrorState";
import { adminApi, getAdminKey } from "../../lib/adminApi";

function formatDateTime(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "-";
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function AdminTikTokIntegrationPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState("");
  const [status, setStatus] = useState(null);

  const [connectLoading, setConnectLoading] = useState(false);
  const [disconnectLoading, setDisconnectLoading] = useState(false);
  const [flash, setFlash] = useState({ type: "", message: "" });

  const [draftLoading, setDraftLoading] = useState(true);
  const [draftError, setDraftError] = useState("");
  const [draft, setDraft] = useState(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftGenerating, setDraftGenerating] = useState(false);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [autoStep, setAutoStep] = useState("");
  const [audioGenerating, setAudioGenerating] = useState(false);
  const [onscreenGenerating, setOnscreenGenerating] = useState(false);
  const [graphicGenerating, setGraphicGenerating] = useState(false);
  const [graphicImageUrl, setGraphicImageUrl] = useState("");
  const [draftForm, setDraftForm] = useState({
    scriptText: "",
    onScreenText: "",
    captionText: "",
    voiceoverText: "",
    status: "SCRIPT_ONLY",
  });

  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const loadStatus = async () => {
    setStatusLoading(true);
    setStatusError("");
    try {
      const response = await adminApi.get("/tiktok/status");
      setStatus(response.data || null);
    } catch (error) {
      setStatus(null);
      const apiMessage = error?.response?.data?.error;
      if (apiMessage) {
        setStatusError(apiMessage);
      } else if (error?.code === "ADMIN_KEY_MISSING") {
        setStatusError("Admin key missing. Lock and unlock the admin panel, then try again.");
      } else {
        setStatusError("Could not reach the backend to load TikTok status. Verify the backend is running and `/api` is reachable.");
      }
    } finally {
      setStatusLoading(false);
    }
  };

  const loadDraft = async () => {
    setDraftLoading(true);
    setDraftError("");
    try {
      const response = await adminApi.get("/tiktok/promo/latest");
      const loaded = response.data?.draft || null;
      setDraft(loaded);
      setDraftForm({
        scriptText: String(loaded?.scriptText || ""),
        onScreenText: String(loaded?.onScreenText || ""),
        captionText: String(loaded?.captionText || ""),
        voiceoverText: String(loaded?.voiceoverText || ""),
        status: String(loaded?.status || "SCRIPT_ONLY"),
      });
    } catch (error) {
      setDraft(null);
      setDraftError(error.response?.data?.error || "Could not load promo draft.");
    } finally {
      setDraftLoading(false);
    }
  };

  useEffect(() => {
    const result = String(query.get("result") || "").trim();
    const message = String(query.get("message") || "").trim();
    if (result) {
      setFlash({
        type: result === "connected" ? "success" : "error",
        message: message || (result === "connected" ? "TikTok connected." : "TikTok connection failed."),
      });
      navigate(location.pathname, { replace: true });
    }
  }, [query, navigate, location.pathname]);

  useEffect(() => {
    loadStatus();
    loadDraft();
  }, []);

  useEffect(() => {
    return () => {
      if (graphicImageUrl) URL.revokeObjectURL(graphicImageUrl);
    };
  }, [graphicImageUrl]);

  const connected = Boolean(status?.connected);

  const connectUrl = useMemo(() => {
    const adminKey = getAdminKey();
    const apiBase = import.meta.env.VITE_API_BASE_URL || "/api";
    return `${apiBase}/admin/tiktok/login?adminKey=${encodeURIComponent(adminKey || "")}`;
  }, []);

  const promoAudioUrl = useMemo(() => {
    const adminKey = getAdminKey();
    const apiBase = import.meta.env.VITE_API_BASE_URL || "/api";
    if (!draft?.id || !draft?.audioReady) return "";
    const bust = draft?.updatedAt ? `&v=${encodeURIComponent(draft.updatedAt)}` : "";
    return `${apiBase}/admin/tiktok/promo/${encodeURIComponent(draft.id)}/audio?adminKey=${encodeURIComponent(adminKey || "")}${bust}`;
  }, [draft?.id, draft?.audioReady, draft?.updatedAt]);

  const promoVideoUrl = useMemo(() => {
    const adminKey = getAdminKey();
    const apiBase = import.meta.env.VITE_API_BASE_URL || "/api";
    if (!draft?.id || !draft?.videoReady) return "";
    const bust = draft?.updatedAt ? `&v=${encodeURIComponent(draft.updatedAt)}` : "";
    return `${apiBase}/admin/tiktok/promo/${encodeURIComponent(draft.id)}/video?adminKey=${encodeURIComponent(adminKey || "")}${bust}`;
  }, [draft?.id, draft?.videoReady, draft?.updatedAt]);

  const connect = () => {
    setConnectLoading(true);
    setFlash({ type: "", message: "" });
    window.location.assign(connectUrl);
  };

  const disconnect = async () => {
    if (!connected) return;
    const ok = window.confirm("Disconnect TikTok? This removes the stored authorization tokens.");
    if (!ok) return;

    setDisconnectLoading(true);
    setFlash({ type: "", message: "" });
    try {
      await adminApi.post("/tiktok/disconnect");
      setFlash({ type: "success", message: "TikTok disconnected." });
      await loadStatus();
    } catch (error) {
      setFlash({ type: "error", message: error.response?.data?.error || "Could not disconnect TikTok." });
    } finally {
      setDisconnectLoading(false);
    }
  };

  const generateToday = async () => {
    setDraftGenerating(true);
    setDraftError("");
    setFlash({ type: "", message: "" });
    try {
      const response = await adminApi.post("/tiktok/promo/generate-today");
      const next = response.data?.draft || null;
      setDraft(next);
      setDraftForm({
        scriptText: String(next?.scriptText || ""),
        onScreenText: String(next?.onScreenText || ""),
        captionText: String(next?.captionText || ""),
        voiceoverText: String(next?.voiceoverText || ""),
        status: String(next?.status || "SCRIPT_ONLY"),
      });
      setFlash({ type: "success", message: "Generated today's promo draft." });
    } catch (error) {
      setDraftError(error.response?.data?.error || "Could not generate today's promo draft.");
    } finally {
      setDraftGenerating(false);
    }
  };

  const waitForVideoReady = async (draftId, { timeoutMs = 320000, pollMs = 4000 } = {}) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await sleep(pollMs);
      const response = await adminApi.get("/tiktok/promo/latest");
      const latest = response.data?.draft || null;
      if (!latest || latest.id !== draftId) continue;

      setDraft(latest);
      if (latest.videoReady) return latest;
      if (latest.status === "FAILED") {
        throw new Error(latest.lastError || "Video rendering failed.");
      }
    }
    throw new Error("Video rendering is taking longer than expected. Please refresh in a minute.");
  };

  const generateTodayAndRender = async () => {
    setAutoGenerating(true);
    setAutoStep("Generating script...");
    setDraftError("");
    setFlash({ type: "", message: "" });

    try {
      const generated = await adminApi.post("/tiktok/promo/generate-today");
      const next = generated.data?.draft || null;
      if (!next?.id) throw new Error("Draft generation did not return an id.");

      setDraft(next);
      setDraftForm({
        scriptText: String(next?.scriptText || ""),
        onScreenText: String(next?.onScreenText || ""),
        captionText: String(next?.captionText || ""),
        voiceoverText: String(next?.voiceoverText || ""),
        status: String(next?.status || "SCRIPT_ONLY"),
      });

      setAutoStep("Generating on-screen text...");
      const onscreen = await adminApi.post(`/tiktok/promo/${next.id}/generate-onscreen`);
      const withOnscreen = onscreen.data?.draft || next;
      setDraft(withOnscreen);
      setDraftForm((p) => ({ ...p, onScreenText: String(withOnscreen?.onScreenText || p.onScreenText || "") }));

      setAutoStep("Generating voiceover audio...");
      const audio = await adminApi.post(`/tiktok/promo/${next.id}/generate-audio`);
      const withAudio = audio.data?.draft || withOnscreen;
      setDraft(withAudio);

      setAutoStep("Rendering video...");
      const video = await adminApi.post(`/tiktok/promo/${next.id}/render-video?force=1`);
      const renderStart = video.data?.draft || withAudio;
      setDraft(renderStart);
      let withVideo = renderStart;
      if (!renderStart?.videoReady) {
        setAutoStep("Rendering video in background...");
        withVideo = await waitForVideoReady(next.id);
      }
      setDraft(withVideo);

      setAutoStep("");
      setFlash({ type: "success", message: "Generated script, voiceover, and video." });
    } catch (error) {
      setAutoStep("");
      setDraftError(error.response?.data?.error || error?.message || "Could not generate + render.");
    } finally {
      setAutoGenerating(false);
    }
  };

  const saveDraft = async () => {
    if (!draft?.id) return;
    setDraftSaving(true);
    setDraftError("");
    setFlash({ type: "", message: "" });
    try {
      const response = await adminApi.patch(`/tiktok/promo/${draft.id}`, {
        scriptText: draftForm.scriptText,
        onScreenText: draftForm.onScreenText,
        captionText: draftForm.captionText,
        voiceoverText: draftForm.voiceoverText,
        status: draftForm.status,
      });
      const next = response.data?.draft || null;
      setDraft(next);
      setFlash({ type: "success", message: "Draft saved." });
    } catch (error) {
      setDraftError(error.response?.data?.error || "Could not save draft.");
    } finally {
      setDraftSaving(false);
    }
  };

  const generateAudio = async () => {
    if (!draft?.id) return;
    setAudioGenerating(true);
    setDraftError("");
    setFlash({ type: "", message: "" });
    try {
      const response = await adminApi.post(`/tiktok/promo/${draft.id}/generate-audio`);
      const next = response.data?.draft || null;
      setDraft(next);
      setFlash({ type: "success", message: "Voiceover audio generated." });
    } catch (error) {
      setDraftError(error.response?.data?.error || "Could not generate audio.");
    } finally {
      setAudioGenerating(false);
    }
  };

  const generateOnscreen = async () => {
    if (!draft?.id) return;
    setOnscreenGenerating(true);
    setDraftError("");
    setFlash({ type: "", message: "" });
    try {
      const response = await adminApi.post(`/tiktok/promo/${draft.id}/generate-onscreen`);
      const next = response.data?.draft || null;
      setDraft(next);
      setDraftForm((p) => ({ ...p, onScreenText: String(next?.onScreenText || "") }));
      setFlash({ type: "success", message: "Generated on-screen text." });
    } catch (error) {
      setDraftError(error.response?.data?.error || "Could not generate on-screen text.");
    } finally {
      setOnscreenGenerating(false);
    }
  };

  const [videoRendering, setVideoRendering] = useState(false);
  const [mediaError, setMediaError] = useState({ audio: "", video: "" });
  const generateGraphicImage = async () => {
    if (!draft?.id) return;
    setGraphicGenerating(true);
    setDraftError("");
    setFlash({ type: "", message: "" });
    try {
      const response = await adminApi.post(`/tiktok/promo/${draft.id}/generate-image`, {}, { responseType: "blob" });
      const blob = response?.data;
      if (!blob || !blob.size) throw new Error("Image response was empty.");
      const nextUrl = URL.createObjectURL(blob);
      setGraphicImageUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return nextUrl;
      });
      setFlash({ type: "success", message: "Graphic image generated." });
    } catch (error) {
      setDraftError(error.response?.data?.error || error?.message || "Could not generate graphic image.");
    } finally {
      setGraphicGenerating(false);
    }
  };

  const renderVideo = async () => {
    if (!draft?.id) return;
    setVideoRendering(true);
    setDraftError("");
    setFlash({ type: "", message: "" });
    try {
      const response = await adminApi.post(`/tiktok/promo/${draft.id}/render-video?force=1`);
      const next = response.data?.draft || null;
      setDraft(next);
      let finalDraft = next;
      if (next?.id && !next?.videoReady) {
        finalDraft = await waitForVideoReady(next.id);
      }
      setDraft(finalDraft);
      setMediaError({ audio: "", video: "" });
      setFlash({ type: "success", message: "Video rendered." });
    } catch (error) {
      setDraftError(error.response?.data?.error || "Could not render video.");
    } finally {
      setVideoRendering(false);
    }
  };

  if (statusLoading) return <LoadingState label="Loading TikTok integration..." />;
  if (statusError) return <ErrorState message={statusError} />;

  return (
    <section className="space-y-3">
      <article className="rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">TikTok Integration</h2>
        <p className="mt-1 text-sm text-slate-600">
          Connect a TikTok account once to enable draft uploads for generated promotional videos.
        </p>
        {flash.message ? (
          <div
            className={`mt-3 rounded border p-3 text-sm ${
              flash.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {flash.message}
          </div>
        ) : null}
      </article>

      <article className="rounded border bg-white p-4">
        <h3 className="text-base font-semibold">Connect TikTok</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded border bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Connection Status</p>
            <p className="mt-2 text-sm font-semibold">{connected ? "Connected" : connectLoading ? "Connecting" : "Not connected"}</p>
            <dl className="mt-3 space-y-1 text-sm text-slate-700">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Account</dt>
                <dd className="text-right">{status?.displayName || "-"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Last connected</dt>
                <dd className="text-right">{formatDateTime(status?.connectedAt)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded border bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <AppButton
                loading={connectLoading}
                loadingText="Redirecting..."
                disabled={connected}
                onClick={connect}
                variant={connected ? "secondary" : "indigo"}
              >
                Connect TikTok
              </AppButton>
              <AppButton
                loading={disconnectLoading}
                loadingText="Disconnecting..."
                disabled={!connected}
                onClick={disconnect}
                variant="danger"
              >
                Disconnect TikTok
              </AppButton>
              <AppButton variant="secondary" onClick={loadStatus} disabled={connectLoading || disconnectLoading}>
                Refresh Status
              </AppButton>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Tokens are stored server-side and never exposed to the browser.
            </p>
          </div>
        </div>
      </article>

      <article className="rounded border bg-white p-4">
        <h3 className="text-base font-semibold">Upload latest promo video to TikTok draft</h3>
        <p className="mt-1 text-sm text-slate-600">
          Coming soon. This will upload the latest generated promo video as a TikTok draft using the connected account.
        </p>
        <div className="mt-3">
          <AppButton disabled variant="secondary">
            Upload Draft
          </AppButton>
        </div>
      </article>

      <article className="rounded border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold">Daily Promo Script (Review + Edit)</h3>
            <p className="mt-1 text-sm text-slate-600">
              Generate a daily script/caption, review it here, then generate voiceover audio. Uploading as TikTok draft will be wired next.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AppButton variant="secondary" onClick={loadDraft} disabled={draftLoading || draftGenerating || draftSaving || audioGenerating || autoGenerating}>
              Refresh
            </AppButton>
            <AppButton
              variant="indigo"
              loading={autoGenerating}
              loadingText={autoStep || "Working..."}
              onClick={generateTodayAndRender}
              disabled={draftSaving || audioGenerating || onscreenGenerating || videoRendering || draftGenerating}
            >
              Generate + Render (Auto)
            </AppButton>
          </div>
        </div>

        {draftLoading ? <div className="mt-3"><LoadingState label="Loading promo draft..." /></div> : null}
        {draftError ? <div className="mt-3"><ErrorState message={draftError} /></div> : null}

        {!draftLoading && !draftError ? (
          <div className="mt-3 space-y-3">
            {!draft ? (
              <div className="rounded border bg-slate-50 p-3 text-sm text-slate-600">
                No draft found yet. Click “Generate Today”.
              </div>
            ) : (
              <>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-sm font-semibold">Script</label>
                    <textarea
                      rows={8}
                      value={draftForm.scriptText}
                      onChange={(e) => setDraftForm((p) => ({ ...p, scriptText: e.target.value }))}
                      className="w-full rounded border px-3 py-2 text-sm"
                      placeholder="Short video script..."
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-semibold">Voiceover (optional override)</label>
                    <textarea
                      rows={8}
                      value={draftForm.voiceoverText}
                      onChange={(e) => setDraftForm((p) => ({ ...p, voiceoverText: e.target.value }))}
                      className="w-full rounded border px-3 py-2 text-sm"
                      placeholder="If empty, voiceover uses script."
                    />
                  </div>
                </div>

                <div className="rounded border bg-slate-50 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">On-screen Text (used in video)</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Put 4–6 short lines (one per line). If empty, the renderer falls back to the script.
                      </p>
                    </div>
                    <AppButton
                      variant="secondary"
                      loading={onscreenGenerating}
                      loadingText="Generating..."
                      onClick={generateOnscreen}
                      disabled={!draft?.id || draftSaving || draftGenerating || audioGenerating || videoRendering || autoGenerating}
                    >
                      Auto-generate
                    </AppButton>
                  </div>
                  <textarea
                    rows={5}
                    value={draftForm.onScreenText}
                    onChange={(e) => setDraftForm((p) => ({ ...p, onScreenText: e.target.value }))}
                    className="mt-3 w-full rounded border bg-white px-3 py-2 text-sm"
                    placeholder={"Scan tickets fast\nLive check-in count\nNo apps needed\nTry Connsura QR Tickets"}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-semibold">Caption</label>
                  <textarea
                    rows={4}
                    value={draftForm.captionText}
                    onChange={(e) => setDraftForm((p) => ({ ...p, captionText: e.target.value }))}
                    className="w-full rounded border px-3 py-2 text-sm"
                    placeholder="Caption + hashtags..."
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <AppButton
                    variant="secondary"
                    onClick={() => setDraftForm((p) => ({ ...p, status: "SCRIPT_ONLY" }))}
                    disabled={draftSaving || draftGenerating || audioGenerating || autoGenerating}
                  >
                    Mark Script Only
                  </AppButton>
                  <AppButton
                    variant="secondary"
                    onClick={() => setDraftForm((p) => ({ ...p, status: "READY_TO_UPLOAD" }))}
                    disabled={draftSaving || draftGenerating || audioGenerating || autoGenerating}
                  >
                    Mark Ready
                  </AppButton>
                  <AppButton
                    variant="success"
                    loading={draftSaving}
                    loadingText="Saving..."
                    onClick={saveDraft}
                    disabled={!draft?.id || draftGenerating || audioGenerating || autoGenerating}
                  >
                    Save Draft
                  </AppButton>
                  <AppButton
                    variant="indigo"
                    loading={audioGenerating}
                    loadingText="Generating audio..."
                    onClick={generateAudio}
                    disabled={!draft?.id || draftGenerating || draftSaving || autoGenerating}
                  >
                    Generate Voiceover Audio
                  </AppButton>
                  <AppButton
                    variant="indigo"
                    loading={graphicGenerating}
                    loadingText="Generating image..."
                    onClick={generateGraphicImage}
                    disabled={!draft?.id || draftGenerating || draftSaving || audioGenerating || autoGenerating || videoRendering}
                  >
                    Generate Graphic (Image Only)
                  </AppButton>
                  <AppButton
                    variant="indigo"
                    loading={videoRendering}
                    loadingText="Rendering video..."
                    onClick={renderVideo}
                    disabled={!draft?.id || draftGenerating || draftSaving || audioGenerating || autoGenerating}
                  >
                    Render Video (20s)
                  </AppButton>
                  <span className="text-xs text-slate-500">
                    Status: <span className="font-semibold">{draftForm.status}</span> · Audio:{" "}
                    <span className="font-semibold">{draft?.audioReady ? "Ready" : "Not generated"}</span>
                    {" "}· Video: <span className="font-semibold">{draft?.videoReady ? "Ready" : "Not rendered"}</span>
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Video rendering requires FFmpeg on the backend host (production container includes it; local dev may need FFmpeg installed).
                </p>
                {draft?.lastError ? (
                  <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Last Error</p>
                    <p className="mt-1 break-words">{draft.lastError}</p>
                  </div>
                ) : null}

                {draft?.audioReady && promoAudioUrl ? (
                  <div className="rounded border bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Voiceover Preview</p>
                    <audio
                      key={promoAudioUrl}
                      className="mt-2 w-full"
                      controls
                      src={promoAudioUrl}
                      onError={() => setMediaError((p) => ({ ...p, audio: "Could not load audio preview. Try opening it in a new tab." }))}
                    />
                    {mediaError.audio ? <p className="mt-2 text-xs text-rose-700">{mediaError.audio}</p> : null}
                    <p className="mt-2 text-xs text-slate-500">
                      If playback fails, click{" "}
                      <a className="font-semibold text-indigo-700 hover:underline" href={promoAudioUrl} target="_blank" rel="noreferrer">
                        open audio
                      </a>
                      .
                    </p>
                  </div>
                ) : null}

                {graphicImageUrl ? (
                  <div className="rounded border bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Graphic Preview</p>
                    <img src={graphicImageUrl} alt="Generated promo graphic" className="mt-2 w-full rounded" />
                  </div>
                ) : null}

                {draft?.videoReady && promoVideoUrl ? (
                  <div className="rounded border bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Video Preview</p>
                    <video
                      key={promoVideoUrl}
                      className="mt-2 w-full rounded"
                      controls
                      src={promoVideoUrl}
                      onError={() => setMediaError((p) => ({ ...p, video: "Could not load video preview. Try opening it in a new tab." }))}
                    />
                    {mediaError.video ? <p className="mt-2 text-xs text-rose-700">{mediaError.video}</p> : null}
                    <p className="mt-2 text-xs text-slate-500">
                      If playback fails, click{" "}
                      <a className="font-semibold text-indigo-700 hover:underline" href={promoVideoUrl} target="_blank" rel="noreferrer">
                        open video
                      </a>
                      .
                    </p>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </article>
    </section>
  );
}
