# v0.12.0-rc.3 — estrutura HTML sobre rc.2

- Shell, navegação, login, Home, Amigos, DMs/canais, perfis, configurações e painéis permanentes declarados no HTML.
- Removidos loadTemplates, fetch de 11 arquivos e Map de marcação; componentes dinâmicos usam templates nativos.
- Páginas reutilizam seus elementos; sessões de mídia continuam independentes. Backend e CallManager idênticos à rc.2.
- Novo teste de estrutura sem JS, ausência de fetch de templates e identidade dos elementos durante navegação/login/logout.
- Corrigidos durante a migração: atributos dinâmicos normalizados pelo parser HTML, referência antiga do editor de perfil e reinicialização visual das regiões persistentes.
- Sem push/deploy. Consulte TEST-RESULTS.md para execução e limites.

# Nightcall v0.12.0-rc.2

Refatoração do frontend existente, preservando as funcionalidades da rc.1. HTML das telas extraído para web/templates; comportamento dividido por área em web/js; CSS formatado em web/css; imagens/ícones em web/assets. app.js ficou responsável por inicializar e encerrar a sessão. Backend e banco preservados byte a byte.

Inclui configuração local opcional, dependência de formatação fixada, .gitignore ampliado, configuração de editor/finais de linha, modelo de PR, CI sem deploy e guia GitHub Desktop para Victor e Gabrielly. COLLABORATION.md aponta para os arquivos implementados.

Veja REFACTOR-REPORT.md para antes/depois, métricas e correções durante a extração; TEST-RESULTS.md para evidência e testes físicos pendentes.
