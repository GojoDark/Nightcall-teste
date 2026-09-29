import { toast, renderTemplate } from "./ui.js";
// Rotas e navegação; não possui capturas de mídia.
export class Navigation {
  constructor({ shell, content, open, members, notifications }) {
    Object.assign(this, {
      shell,
      content,
      open,
      members,
    });
    this.restoring = false;
    const bar = shell.querySelector(".mobile-topbar");
    const backdrop = document.getElementById("nav-backdrop");
    bar.querySelector("#mobile-menu").onclick = () => {
      shell.classList.add("nav-open");
      history.pushState(
        {
          ...history.state,
          drawer: true,
        },
        "",
      );
    };
    backdrop.onclick = () => this.close();
    bar.querySelector("#mobile-back").onclick = () => {
      if (history.state?.nightcallIndex > 0 || history.state?.drawer)
        history.back();
      else
        this.open({
          type: "section",
          id: "messages",
        });
    };
    bar.querySelector("#mobile-members").onclick = () => {
      this.close(false);
      members();
    };
    bar.querySelector("#mobile-notifications").onclick = notifications;
    this.pop = async (e) => {
      shell.classList.toggle("nav-open", !!e.state?.drawer);
      const route = e.state?.nightcallRoute;
      if (!route) return;
      if (JSON.stringify(route) === JSON.stringify(this.route)) return;
      this.restoring = true;
      try {
        await open(route);
      } finally {
        this.restoring = false;
      }
    };
    addEventListener("popstate", this.pop);
    this.viewport = () => {
      const v = window.visualViewport;
      shell.style.setProperty("--app-height", `${v?.height || innerHeight}px`);
      shell.style.setProperty("--app-top", `${v?.offsetTop || 0}px`);
    };
    window.visualViewport?.addEventListener("resize", this.viewport);
    window.visualViewport?.addEventListener("scroll", this.viewport);
    addEventListener("resize", this.viewport);
    this.viewport();
  }
  set(route, title) {
    const same = JSON.stringify(route) === JSON.stringify(this.route);
    this.route = route;
    document.getElementById("mobile-members").hidden = ![
      "space",
      "channel",
    ].includes(route.type);
    document.getElementById("mobile-title").textContent = title || "Nightcall";
    this.shell.classList.remove("nav-open");
    if (!this.restoring && !same) {
      const initial = !history.state?.nightcallRoute,
        method =
          initial || history.state?.drawer ? "replaceState" : "pushState";
      history[method](
        {
          nightcallRoute: route,
          nightcallIndex: initial
            ? 0
            : (history.state.nightcallIndex || 0) +
              (method === "pushState" ? 1 : 0),
        },
        "",
      );
    }
  }
  close(back = true) {
    if (back && history.state?.drawer) {
      history.back();
      return;
    }
    this.shell.classList.remove("nav-open");
  }
  destroy() {
    removeEventListener("popstate", this.pop);
    removeEventListener("resize", this.viewport);
    window.visualViewport?.removeEventListener("resize", this.viewport);
    window.visualViewport?.removeEventListener("scroll", this.viewport);
  }
}
export function createNavigation({ state, services, actions }) {
  services.navigation = new Navigation({
    shell: document.querySelector(".app-shell"),
    content: services.content,
    open: async (route) => {
      if (route.type === "dm") return actions.openConversation(route.id);
      if (route.type === "channel")
        return actions.openSpace(route.spaceId, route.id);
      if (route.type === "space") return actions.openSpace(route.id);
      if (route.type === "profile") return actions.openUserProfile(route.id);
      return actions.setSection(route.id);
    },
    members: () => {
      if (state.store.community)
        actions.toggleMemberPanel(state.store.community.sp);
      else toast("Abra uma comunidade para ver os membros.");
    },
    notifications: actions.showNotifications,
  });
  function homeSidebar() {
    const side = document.querySelector(".context-sidebar");
    side.querySelector(".context-header").innerHTML = renderTemplate(
      "navigation.home-sidebar-content",
      {},
    );
    side.querySelector(".context-nav").style.display = "";
    side.querySelector(".side-label").style.display = "";
    side.querySelector("#dm-list").style.display = "";
  }
  function enterPage(route, title) {
    state.routeGeneration++;
    services.chat.close();
    state.activeDm = null;
    services.navigation.set(route, title);
    document.getElementById("member-panel")?.remove();
    return state.routeGeneration;
  }
  function setSection(s) {
    actions.enterPage(
      {
        type: "section",
        id: s,
      },
      {
        home: "Início",
        friends: "Amigos",
        messages: "Mensagens",
        profile: "Perfil",
        settings: "Configurações",
      }[s],
    );
    document.getElementById("member-panel")?.remove();
    actions.homeSidebar();
    state.activeSpace = null;
    actions.drawSpaces();
    state.section = s;
    state.activeDm = null;
    document
      .querySelectorAll(".nav-item")
      .forEach((x) => x.classList.toggle("active", x.dataset.sec === s));
    actions.drawDmSidebar();
    if (s === "home") actions.renderHome();
    if (s === "friends") actions.renderFriends();
    if (s === "messages") actions.renderMessages();
    if (s === "profile") actions.openUserProfile(state.user.accountId);
    if (s === "settings") actions.renderSettings();
  }
  return {
    homeSidebar,
    enterPage,
    setSection,
  };
}
