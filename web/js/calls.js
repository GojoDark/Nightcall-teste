import { CallManager } from "./call-manager.js";
import { CallView } from "./call-view.js";
import { PrivateCalls } from "./private-calls.js";
import { api, esc, errText, toast } from "./ui.js";
import { icons } from "../assets/icons.js";

// Integração das chamadas com o restante do aplicativo.
export function createCalls({ state, services, actions }) {
  services.manager = new CallManager({
    accountId: state.user.accountId,
    api,
    changed: () => {
      services.callView?.update();
      services.privateCalls?.mediaChanged();
    },
    error: (e) => toast(e.message || "Falha na comunicação."),
  });
  services.callView = new CallView(services.manager, {
    user: state.user,
    icons,
    esc,
    toast,
    profile: actions.openUserProfile,
    leave: () =>
      services.manager.session?.kind === "private"
        ? services.privateCalls.end()
        : services.manager.leave(),
  });
  services.rtcReady = services.manager
    .configure()
    .catch((e) => toast("Configuração de conexão: " + e.message));
  services.privateCalls = new PrivateCalls({
    api,
    manager: services.manager,
    view: services.callView,
    user: state.user,
    toast,
    changed: async (cid) => {
      await actions.loadDms();
      if (cid) await actions.openConversation(cid);
    },
    notify: actions.internalNotification,
  });
  const unloadCall = () => {
    const s = services.manager.session;
    if (s?.kind === "voice")
      navigator.sendBeacon?.(
        `/api/voice/${s.id}/leave`,
        new Blob(
          [
            JSON.stringify({
              sessionId: s.localId,
            }),
          ],
          {
            type: "application/json",
          },
        ),
      );
    else if (
      services.privateCalls.current &&
      ["calling", "ringing", "connecting", "connected"].includes(
        services.privateCalls.current.state,
      )
    )
      navigator.sendBeacon?.(
        `/api/calls/${services.privateCalls.current.call_id}/end`,
        new Blob(
          [
            JSON.stringify({
              clientId: services.privateCalls.clientId,
            }),
          ],
          {
            type: "application/json",
          },
        ),
      );
  };
  async function startPrivateCall(targetId, name) {
    try {
      await services.rtcReady;
      if (services.privateCalls.creating) return;
      await services.privateCalls.start(targetId);
    } catch (e) {
      toast(errText(e.message));
    }
  }
  async function joinVoiceChannel(sp, channels, channelId) {
    try {
      if (
        services.privateCalls.current &&
        ["calling", "ringing", "connecting", "connected"].includes(
          services.privateCalls.current.state,
        )
      )
        throw Error("Encerre a chamada privada antes de entrar no canal.");
      await services.rtcReady;
      const entered = await services.manager.enter({
        kind: "voice",
        id: channelId,
        localId: crypto.randomUUID(),
        name: channels.find((c) => c.channelId === channelId)?.name || "Voz",
      });
      if (!entered) return;
      services.navigation.close(false);
      services.callView.show();
      await actions.refreshVoiceUsers(channelId);
    } catch (e) {
      toast(errText(e.message));
    }
  }
  return {
    startPrivateCall,
    joinVoiceChannel,
    unloadCall,
  };
}
