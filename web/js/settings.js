import { esc, toast, renderTemplate, showPage } from "./ui.js";
// Preferências de dispositivos e conta.
export function createSettings({ state, services, actions }) {
  async function renderSettings() {
    state.section = "settings";
    const generation = state.routeGeneration;
    let devices = [];
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch {}
    if (generation !== state.routeGeneration) return;
    const prefs = services.manager.settings;
    showPage("settings.settings-settings-page", {
      devicesItemsItems: devices
        .filter((d) => d.kind === "audioinput")
        .map((d) =>
          renderTemplate("settings.input-option", {
            deviceId: esc(d.deviceId),
            label: esc(d.label || "Microfone"),
          }),
        )
        .join(""),
      devicesItemsItems2: devices
        .filter((d) => d.kind === "audiooutput")
        .map((d) =>
          renderTemplate("settings.output-option", {
            deviceId: esc(d.deviceId),
            label: esc(d.label || "Saída de áudio"),
          }),
        )
        .join(""),
      contentItems: [
        ["echoCancellation", "Cancelamento de eco"],
        ["noiseSuppression", "Supressão de ruído"],
        ["autoGainControl", "Ganho automático"],
      ]
        .map(([key, label]) =>
          renderTemplate("settings.processing-checkbox", {
            key: key,
            checkedAttribute: prefs[key] ? "checked" : "",
            label: label,
          }),
        )
        .join(""),
    });
    const form = document.getElementById("audio-settings");
    form.elements.input.value = prefs.input;
    form.elements.output.value = prefs.output;
    if (!("setSinkId" in HTMLMediaElement.prototype)) {
      form.elements.output.disabled = true;
      document.getElementById("output-support").textContent =
        "Este navegador usa a saída padrão do sistema.";
    }
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await services.manager.updateSettings({
          input: form.elements.input.value,
          output: form.elements.output.value,
          echoCancellation: form.elements.echoCancellation.checked,
          noiseSuppression: form.elements.noiseSuppression.checked,
          autoGainControl: form.elements.autoGainControl.checked,
        });
        toast("Dispositivos atualizados.");
      } catch (x) {
        toast("Não foi possível aplicar os dispositivos: " + x.message);
      }
    };
    document.getElementById("go-profile-settings").onclick = () =>
      actions.openUserProfile(state.user.accountId);
    document.getElementById("settings-logout").onclick = actions.logout;
    document.getElementById("test-mic").onclick = async () => {
      let stream;
      try {
        stream = await services.manager.captureMic();
        toast(
          "Captura disponível. A chamada continua usando seu microfone atual.",
        );
      } catch (e) {
        toast(e.message);
      } finally {
        stream?.getTracks().forEach((t) => t.stop());
      }
    };
  }
  return {
    renderSettings,
  };
}
