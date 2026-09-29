> Esta rc.3 é entregue em ZIP, sem novos commits ou push. O histórico/bundle rc.2 mencionado abaixo continua sendo o da entrega anterior; não inclui a migração HTML rc.3.

# Victor e Gabrielly — começar pelo GitHub Desktop

## Situação desta entrega

Repositório: https://github.com/GojoDark/Nightcall. Ele estava vazio ao ser clonado em 29/09/2026. Foi preparado um histórico **local**: main preserva a v0.12.0-rc.1, e refactor/organizacao-frontend contém a refatoração. Nenhum push ou deploy foi executado. O ZIP contém o projeto; o Git bundle entregue separadamente preserva os commits sem incluir configurações/credenciais locais.

## Primeiro envio — Victor

No computador desta sessão existe um clone preparado em work/nightcall-github, dentro da pasta desta tarefa. No GitHub Desktop, use File → Add Local Repository e escolha essa pasta.

1. Em Current Branch, selecione main e use Publish branch para enviar a baseline ao repositório existente.
2. Selecione refactor/organizacao-frontend e publique essa branch.
3. Abra uma pull request dessa branch para main e revise o comparativo. Depois da revisão, faça o merge.
4. Esse envio compartilha código no GitHub; não coloca o site no ar. O arquivo de Actions incluído roda testes/build, sem etapa de deploy.

Se estiver em outro computador e quiser preservar o histórico local entregue, use Git para clonar o bundle para uma pasta nova, troque a URL de origin por https://github.com/GojoDark/Nightcall.git e adicione essa pasta ao Desktop. Alternativamente, copie o conteúdo do ZIP para seu clone vazio e faça um primeiro commit, sem copiar .env ou data/.

## Clonar — Victor e Gabrielly

Depois que houver código no remoto, no Desktop use File → Clone Repository → URL, informe https://github.com/GojoDark/Nightcall e escolha uma pasta local. Gabrielly precisa aceitar o convite de colaboração enviado pelo proprietário para poder enviar mudanças ao mesmo repositório. O convite não foi enviado nesta sessão. [Guia oficial de clone](https://docs.github.com/en/desktop/adding-and-cloning-repositories/cloning-and-forking-repositories-from-github-desktop).

1. Instalem Node.js 24 ou superior e abram a pasta do projeto no editor.
2. No terminal dessa pasta, executem npm ci. Isso instala a versão fixa do formatador; o servidor não tem dependências externas de produção.
3. Se precisarem personalizar porta/banco/TURN, copiem .env.example para .env. O .env fica somente no computador de cada um.
4. Executem npm start e abram http://localhost:3000 (ou a porta escolhida).
5. Cada computador cria seu próprio banco em data/. Git não sincroniza contas/mensagens. Para testar juntos, ambos precisam acessar o mesmo servidor de teste com HTTPS para mídia fora de localhost; nenhum servidor externo foi criado nesta entrega.

## Rotina de trabalho

Comecem em main, usem Fetch origin e depois Pull origin quando houver mudanças. Criem uma branch pelo menu Current Branch → New Branch: por exemplo victor/ajuste-perfil ou gabrielly/cores-home. Alterem uma área por vez. [Guia oficial de branches](https://docs.github.com/en/desktop/making-changes-in-a-branch/managing-branches-in-github-desktop).

No painel Changes, revisem os arquivos. Escrevam um resumo claro e façam Commit na sua branch. Commit salva localmente; Push origin envia ao GitHub. Abram uma pull request para a outra pessoa revisar antes do merge. Após o merge, voltem à main e façam Fetch/Pull antes da próxima mudança.

## Se houver conflito

Não escolham tudo de uma pessoa sem ler. Abram os arquivos indicados no editor, comparem as duas alterações e combinem qual conteúdo deve ficar. Removam os marcadores de conflito somente depois de preservar o que é necessário. Salvem, rodem os testes e concluam a resolução no Desktop. Se não entenderem uma alteração em mídia/banco/autenticação, conversem antes de confirmar. Evitem force push na main.

## Arquivos preparados

- .gitignore: exclui .env, bancos, node_modules, dist, logs, ferramentas baixadas e resultados temporários.
- .env.example: apenas valores locais de exemplo e campos TURN vazios.
- package-lock.json: fixa a dependência de desenvolvimento; usem npm ci.
- .editorconfig, .gitattributes e .prettierrc.json: padronizam formatação e finais de linha.
- .github/pull_request_template.md: roteiro curto para descrever e revisar mudanças.
- .github/workflows/checks.yml: preparado para teste, build, formatação e varredura básica; ainda não executado no GitHub. Usa as actions oficiais [checkout](https://github.com/actions/checkout) e [setup-node](https://github.com/actions/setup-node).

Comandos úteis: npm test; npm run build; npm run format:check; npm run format; npm run check:project. A varredura reconhece alguns formatos de credenciais; não é garantia de auditoria completa. Não enviem o .env ou o banco mesmo que um teste passe.
