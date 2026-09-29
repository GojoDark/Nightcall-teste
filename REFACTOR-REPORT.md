> Histórico da modularização rc.2. Para a migração HTML rc.3, consulte HTML-MIGRATION.md.

# Refatoração executada — Nightcall v0.12.0-rc.2

## Antes

web/app.js concentrava autenticação, Home, amigos, DMs, perfis, comunidades, configurações, notificações e integração/sincronização. A marcação das telas era montada em strings nesse arquivo. CSS e módulos de mídia já existentes ficavam diretamente em web/.

```text
web/
  index.html
  app.js
  styles.css / mobile.css / call.css
  call-manager.js / call-view.js / private-calls.js
  chat-view.js / navigation.js / sync-engine.js
  nightcall-*.png
server/ (mantido)
```

## Depois

```text
web/
  index.html
  js/
    app.js                 inicialização e encerramento da sessão
    auth.js                login e cadastro
    home.js                Home e atalhos
    friends.js             amizades
    messages.js            DMs, chat e leitura
    profile.js             perfil e edição
    communities.js         comunidades, canais, convites e membros
    settings.js            dispositivos e conta
    calls.js               integração das chamadas
    call-manager.js        mídia/WebRTC persistente
    private-calls.js       aceite e estados da chamada privada
    call-view.js           vídeos, controles e PiP
    navigation.js          rotas, menu e voltar
    notifications.js       notificações
    synchronization.js     scheduler e sincronização
    ui.js                  apresentação compartilhada, API e templates
  templates/               HTML separado por área
  css/
    style.css / responsive.css / calls.css
  assets/
    images/ / icons.js
server/                    mesmos arquivos e conteúdo da baseline
tests/                     regressão existente + templates e auth/UI
.github/                   modelo de PR e verificações sem deploy
```

## O que realmente saiu de app.js

Foram extraídas as implementações de autenticação, Home, amizades, diretório/chat de mensagens, perfil público/editor, comunidades/canais/convites/membros, configurações, notificações, ações de navegação, integração de chamadas e polling. O ChatView foi reunido com messages.js e o SyncEngine com synchronization.js. O helper findPerson, sem chamadas no código original, foi removido. Não foram criados mocks para substituir recursos.

app.js agora cria state/services/actions, conecta os módulos e coordena entrada/saída. Os arquivos foram formatados; HTML é editável nos templates, não escondido em funções de uma linha.

| Medida de app.js | Antes | Depois |
|---|---:|---:|
| Bytes UTF-8 | 49749 | 4338 |
| Linhas físicas | 167 | 135 |
| Linhas com a mesma formatação legível | 1324 | 135 |

A contagem física anterior é enganosa porque várias funções completas ocupavam uma única linha. Bytes e a comparação com a mesma formatação mostram a retirada de responsabilidades. Métricas também em REFACTOR-METRICS.json.

## Arquivos criados/modificados

Criados: 16 módulos em web/js, 11 arquivos HTML em web/templates, três CSS formatados em web/css, assets/icons.js, dois testes novos (templates.test.js e auth-ui.mjs), check-project.js, package-lock.json, .env.example, .editorconfig, .gitattributes, .prettierrc.json, .prettierignore, modelo de PR e workflow. As três imagens de web/ foram movidas para assets/images. Recursos de referência antigos da raiz foram preservados.

Modificados: web/index.html, caminhos de imagem no manifest/service worker, imports/caminhos dos testes, scripts/test.js, package.json, inicializador local e documentação. Os antigos arquivos frontend de mesmo propósito foram removidos depois da extração; não ficaram duas implementações ativas. O diff Git permite ver os movimentos.

Comparação byte a byte: 6 arquivos de server/ preservados (auth.js, conversations.js, db.js, index.js, smoke.js, voice-presence.js). Não houve alteração de schema, autenticação, signaling ou regras de negócio no backend.

## Regressões da extração encontradas e corrigidas

1. Referências antigas ao logotipo após mover imagens: corrigidas nos HTMLs e notificações; teste verifica carregamento.
2. Callback de perfil no chat e botão de notificações capturados antes do registro das ações: convertidos em callbacks que consultam a ação no clique; teste de UI exercita ambos.
3. Leitor de templates dependia de uma abertura/fechamento sem quebra de linha. A formatação do formulário expôs isso no cadastro: leitor corrigido para aceitar espaços/quebras; testes de templates e cadastro/login adicionados.

Os testes de execução e limitações estão em TEST-RESULTS.md. Continua sendo candidata para validação física, sem deploy.

## GitHub

O remoto informado foi clonado e estava vazio. A main local preserva a baseline; a branch refactor/organizacao-frontend contém a reorganização. Commits locais e bundle permitem revisão/reversão. Nenhum push, merge remoto ou deploy foi realizado. O fluxo de primeiro envio, clone, instalação e trabalho em dupla está em GITHUB-DESKTOP.md. CI preparado ainda depende do envio ao GitHub para rodar lá.
