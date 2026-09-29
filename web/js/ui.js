import { icons } from "../assets/icons.js";
export const api = async (path, opt = {}) => {
  const r = await fetch(path, {
    signal: AbortSignal.timeout(10000),
    credentials: "include",
    ...opt,
    headers: {
      "Content-Type": "application/json",
      ...(opt.headers || {}),
    },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok)
    throw Object.assign(Error(d.error || "REQUEST_FAILED"), {
      status: r.status,
    });
  return d;
};
export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
export const errText = (c) =>
  ({
    CALL_BUSY: "Essa pessoa ou você já está em uma chamada.",
    NOT_CONNECTED: "Adicione a pessoa como amiga para conversar.",
    CHANNEL_NOT_FOUND: "Canal não encontrado ou acesso não permitido.",
    CONVERSATION_NOT_FOUND: "Conversa não encontrada.",
    UNAUTHORIZED: "Sua sessão expirou. Entre novamente.",
    REQUEST_FAILED: "Não foi possível acessar o servidor.",
    USERNAME_TAKEN: "Esse @ID já está em uso.",
    EMAIL_TAKEN: "Esse e-mail já está em uso.",
    INVALID_CREDENTIALS: "ID/e-mail ou senha inválidos.",
    USER_NOT_FOUND: "Usuário não encontrado.",
    CANNOT_ADD_SELF: "Você não pode adicionar a própria conta.",
    RELATION_EXISTS: "Já existe uma relação entre essas contas.",
    INVALID_SPACE_NAME: "Escolha um nome entre 1 e 48 caracteres.",
    INVALID_INVITE: "Convite inválido ou expirado.",
  })[c] || "Não foi possível concluir a operação.";
export function avatar(u, cl = "md") {
  return renderTemplate("ui.avatar-avatar", {
    sizeClass: cl,
    backgroundAttribute: u?.avatarUrl
      ? `style="background-image:url('${esc(u.avatarUrl)}')"`
      : "",
    initial: u?.avatarUrl ? "" : esc((u?.displayName || "?")[0].toUpperCase()),
  });
}
export function logo(small = false) {
  return renderTemplate("ui.logo-brand-logo", {
    sizeClass: small ? "small" : "",
  });
}
export const fileDataUrl = async (file, max = 104857600, dimension = 512) => {
  if (!file) return "";
  if (file.size > max) throw Error("FILE_TOO_LARGE");
  if (!/^image\/(png|jpeg|webp|gif)$/i.test(file.type))
    throw Error("INVALID_IMAGE");
  let blob = file;
  if (file.type !== "image/gif" && globalThis.createImageBitmap) {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(
      1,
      dimension / Math.max(bitmap.width, bitmap.height),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    canvas
      .getContext("2d")
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    blob =
      (await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.85),
      )) || file;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
export function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

// Apresentação de erros da página.
export function createUi({ state, services, actions }) {
  function showPageError(message, retry) {
    services.content.innerHTML = renderTemplate(
      "ui.show-page-error-page-error",
      {},
    );
    services.content.querySelector("p").textContent = message;
    services.content.querySelector("button").onclick = retry;
  }
  return {
    showPageError,
  };
}
// A estrutura já existe no documento; só os campos de dados são preenchidos.
const pages = [];
export function initializeDocument() {
  document.querySelectorAll("[data-page]").forEach((page) => {
    pages.push(page);
    page.remove();
  });
}
export function fillFields(root, values) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const fields = [];
  while (walker.nextNode())
    if (walker.currentNode.data.startsWith("field:"))
      fields.push(walker.currentNode);
  for (const start of fields) {
    const key = start.data.slice(6);
    if (!(key in values)) continue;
    let end = start.nextSibling;
    while (end && !(end.nodeType === 8 && end.data === "end-field"))
      end = end.nextSibling;
    const range = document.createRange();
    range.setStartAfter(start);
    range.setEndBefore(end);
    range.deleteContents();
    range.insertNode(range.createContextualFragment(String(values[key] ?? "")));
  }
}
export function showPage(
  name,
  values,
  container = document.getElementById("content"),
) {
  const page = pages.find((node) => node.dataset.page === name);
  fillFields(page, values);
  page.querySelectorAll("form").forEach((form) => form.reset());
  container.replaceChildren(page);
  return page;
}
export function renderShell(user) {
  document.querySelector(".boot").hidden = true;
  document.querySelector(".auth-page").hidden = true;
  const shell = document.querySelector(".app-shell");
  shell.hidden = false;
  shell.classList.remove("nav-open");
  document.getElementById("content").replaceChildren();
  fillFields(shell, {
    avatar: avatar(user, "sm"),
    displayName: esc(user.displayName),
    username: esc(user.username),
    mic: icons.mic,
    head: icons.head,
    gear: icons.gear,
  });
  shell.querySelector(".profile-dock .presence").className =
    "presence " + user.status;
}
// Somente componentes dinâmicos usam templates nativos já presentes no HTML.
export function renderTemplate(name, values = {}) {
  const template = document.getElementById(name);
  if (!(template instanceof HTMLTemplateElement))
    throw Error("Template não carregado: " + name);
  return template.innerHTML
    .replace(/data-template-attribute="({{\w+}})"/g, "$1")
    .replace(/{{(\w+)}}/g, (_, key) => {
      if (!(key in values)) throw Error("Campo ausente: " + name + "." + key);
      return String(values[key] ?? "");
    });
}
