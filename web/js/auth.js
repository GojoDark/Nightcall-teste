import { api, errText, logo, renderTemplate } from "./ui.js";
export function showAuth(onAuthenticated) {
  document.querySelector(".boot").hidden = true;
  document.querySelector(".app-shell").hidden = true;
  document.querySelector(".auth-page").hidden = false;
  document.getElementById("content").replaceChildren();
  document.getElementById("notification-panel").hidden = true;
  document.getElementById("space-modal").hidden = true;
  let mode = "login";
  const form = document.getElementById("auth-form");
  const switchBtn = document.getElementById("switch");
  function render() {
    document.getElementById("auth-eyebrow").textContent =
      mode === "login" ? "BEM-VINDO DE VOLTA" : "COMECE O SEU CANTO";
    document.getElementById("auth-title").textContent =
      mode === "login" ? "Entre no Nightcall." : "Crie sua conta.";
    document.getElementById("auth-sub").textContent =
      mode === "login"
        ? "Converse, ligue e encontre quem está online."
        : "Seu nick pode ser repetido. Seu @ID, não.";
    form.innerHTML = renderTemplate("auth.form", {
      fields:
        mode === "register"
          ? renderTemplate("auth.register-fields", {})
          : renderTemplate("auth.login-fields", {}),
      submitLabel: mode === "login" ? "Entrar" : "Criar conta",
    });
    switchBtn.textContent =
      mode === "login"
        ? "Ainda não tem conta? Criar conta"
        : "Já tem conta? Entrar";
  }
  render();
  switchBtn.onclick = () => {
    mode = mode === "login" ? "register" : "login";
    render();
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const b = Object.fromEntries(fd.entries());
    const error = document.getElementById("form-error");
    try {
      const d = await api(
        mode === "login" ? "/api/auth/login" : "/api/auth/register",
        {
          method: "POST",
          body: JSON.stringify(b),
        },
      );
      onAuthenticated(d.user);
    } catch (x) {
      error.textContent = errText(x.message);
      error.hidden = false;
    }
  };
}
