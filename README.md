# Hora a Hora — edição Vercel

Aplicação completa para registros mensais e anuais, criada em Next.js para a Vercel. Cada pessoa possui conta, senha, sessão e dados separados. A versão profissional 4.2.1 organiza o aplicativo em quatro áreas — Início, Histórico, Estudantes e Relatórios — e traz uma central de histórico anual com filtros retráteis, agrupamento mensal, situação da sincronização, resumo dos resultados, carregamento progressivo e exportação filtrada. A ficha individual ganhou filtros de situação e ano, linha do tempo e variação de progresso; exclusões de registros agora podem ser desfeitas. Também inclui cronômetro persistente com estado visual, notificação e ações, funcionamento offline com sincronização posterior, horas de serviço e LDC separadas, metas mensal e anual digitáveis, fechamento configurável, compartilhamento nativo, PDF mensal, CSV, PWA instalável no Android, painel administrativo, contas de teste por 24 horas, sete temas visuais, calendário interativo, comparação mensal e acessibilidade.

## Produtividade e experiência

- calendário mensal com dias preenchidos, pendentes, sem horas e futuros;
- áreas separadas para painel inicial, histórico, estudantes e relatórios, com navegação adaptada ao computador e ao celular;
- histórico anual agrupado por mês, com painel de filtros retrátil, busca, período, categoria, estudante, sincronização, ordenação, totais e exportação apenas dos resultados visíveis;
- ações de editar e excluir no histórico, com opção temporária para desfazer uma exclusão;
- botão destacado para registrar o dia atual e registro rápido ao tocar em qualquer dia;
- preenchimento do tempo em campos separados de horas e minutos, aceitando até 200 horas por categoria;
- separação entre horas de serviço e horas LDC, com total consolidado e layout adaptado a telas pequenas;
- atalhos de 15, 30, 45 e 60 minutos nos formulários;
- cronômetro com início imediato e independente da permissão de notificações, além de pausar, continuar, finalizar, recuperar após fechar o app e oferecer ações **Pausar/Continuar** e **Parar e salvar** nas notificações de navegadores compatíveis;
- meta anual com acumulado, horas restantes, média necessária, gráfico e projeção;
- metas mensal e anual digitáveis em **Minha conta**, além do controle deslizante sincronizado;
- cadastro de estudantes por nome, iniciais ou apelido para evitar contagem duplicada;
- seleção dos estudantes em cada registro, preservando os nomes no histórico, PDF e CSV;
- ficha de cada estudante com dias e horário preferidos, endereço, início, situação e observações;
- próximo encontro configurável, com recorrência semanal e avanço automático da agenda após o registro;
- lembrete individual no horário preferido de cada estudo, com atalho direto para a ficha do estudante;
- histórico cronológico de presença, falta e reagendamento, com filtros por situação e ano, variação de progresso e ações para editar ou excluir cada lançamento;
- registro do assunto estudado, observações e progresso percentual, com controle deslizante e campo numérico exato;
- aviso no painel quando um estudante ultrapassa seu limite individual de dias sem acompanhamento;
- página exclusiva de cada estudante com resumo da agenda, endereço, progresso, totais, histórico completo e horas vinculadas;
- agenda dos estudantes incluída no PDF mensal e preferências exportadas no CSV;
- registro rápido com campos que limpam o zero ao receber foco, total calculado e confirmação aguardada antes de fechar;
- salvamento do registro rápido e do formulário completo sem bloqueio silencioso da validação LDC;
- campos de data e horário dos estudos contidos corretamente no card, inclusive em telas estreitas;
- saudação de acordo com o horário, resumo da meta e avatar personalizado;
- validações abaixo dos campos, confirmação visual após salvar e reconciliação independente do cache local;
- navegação inferior com ação central de registro no celular;
- animação do gráfico e transições suaves entre os meses;
- comparação de horas, publicações e estudos com o mês anterior;
- tour automático para novas contas, disponível novamente em **Minha conta**;
- rascunho automático no formulário completo;
- compartilhamento do PDF pelo menu nativo do aparelho e resumo direto no WhatsApp;
- regra opcional de arredondamento apenas no fechamento, sem alterar os registros originais;
- texto maior e contraste extra, salvos no aparelho;
- lembrete opcional após 2, 3 ou 5 dias sem registro.

## Funcionamento offline

Depois do primeiro acesso, a estrutura, os estilos e os recursos já visitados ficam disponíveis sem conexão. Os registros mensais, anuais e a última ficha individual visitada são mantidos no IndexedDB do aparelho. Se a internet cair durante uma inclusão, edição ou exclusão de registro, a alteração entra em uma fila local e é sincronizada automaticamente ao reconectar. Edições sucessivas do mesmo item são compactadas; respostas de validação ou conflito permanecem pendentes para revisão em vez de serem descartadas. O cabeçalho informa claramente se o sistema está **Sincronizado**, **Offline** ou com alterações **Pendentes**.

O último usuário autenticado pode consultar e registrar dados offline naquele aparelho somente até a expiração real da sessão. Contas de teste sempre exigem validação online. Um logout limpa caches, fila, preferências privadas e notificações da conta; se estiver sem conexão, o navegador mantém um marcador para confirmar o encerramento do cookie no servidor ao reconectar.

Quando o servidor confirma uma inclusão ou edição, o registro é atualizado imediatamente na tela. Uma indisponibilidade do IndexedDB não substitui mais o resultado confirmado pelo banco por uma cópia antiga.

Os lembretes usam as notificações do navegador. A verificação acontece ao abrir o site ou aplicativo e, em aparelhos Android compatíveis, também tenta usar a sincronização periódica da PWA em segundo plano. O usuário precisa permitir notificações quando o navegador solicitar. A entrega exata em segundo plano depende das regras de economia de bateria e do suporte do navegador; com o app aberto, a verificação dos lembretes individuais ocorre a cada 30 segundos.

## Temas de cores

O botão **Tema** aparece na tela de acesso e no cabeçalho do painel. Estão disponíveis os temas Azul, Rosa, Verde, Lilás, Amarelo, Dark e Branco. A escolha fica salva no aparelho e é restaurada automaticamente na próxima visita. O relatório mensal em PDF também usa a cor principal do tema escolhido.

## Tecnologias

- Next.js 16 e React 19
- PostgreSQL serverless da Neon
- Drizzle ORM e migrações SQL
- Resend para e-mails de recuperação
- jsPDF para relatórios mensais, com emojis incorporados nas anotações e no nome do usuário
- IndexedDB para cache de dados e fila de sincronização offline
- PWA com manifesto, ícones e service worker com cache de recursos

## Rodar localmente

1. Instale Node.js 20 ou superior.
2. Execute `npm install`.
3. Copie `.env.example` para `.env.local` e preencha as variáveis.
4. Execute `npm run db:migrate`.
5. Execute `npm run dev` e acesse `http://localhost:3000`.

Para validar antes de publicar:

```bash
npm test
npm run typecheck
npm run lint
npm run db:check
npm run build
```

## Publicar na Vercel — passo a passo

### 1. Envie esta pasta para um repositório

Crie um repositório no GitHub e envie **o conteúdo desta pasta `vercel` como raiz do repositório**. O arquivo `package.json` deve aparecer na primeira tela do repositório.

### 2. Crie o projeto na Vercel

1. Entre em `vercel.com` e clique em **Add New → Project**.
2. Importe o repositório.
3. Confirme o framework **Next.js**.
4. Não publique ainda: primeiro conecte o banco e configure o e-mail.

### 3. Conecte o PostgreSQL da Neon

1. No projeto da Vercel, abra **Storage** ou **Marketplace**.
2. Escolha **Neon Postgres** e conecte/crie o banco.
3. Confirme que a integração criou a variável `DATABASE_URL` nos ambientes Production, Preview e Development.

O comando `npm run vercel-build` executa as migrações antes da compilação. Na primeira publicação, ele cria as tabelas automaticamente.

### 4. Configure recuperação por e-mail

1. Crie uma conta no Resend.
2. Adicione e valide um domínio seu no painel do Resend.
3. Crie uma chave de API.
4. Na Vercel, abra **Settings → Environment Variables** e adicione:

| Variável | Exemplo | Finalidade |
|---|---|---|
| `DATABASE_URL` | criada pela Neon | conexão PostgreSQL |
| `ADMIN_EMAILS` | `voce@seudominio.com.br` | um ou mais administradores, separados por vírgula |
| `TRIAL_CREATOR_EMAILS` | `voce@seudominio.com.br` | administradores autorizados a criar contas de teste; se não informar, usa `ADMIN_EMAILS` |
| `RESEND_API_KEY` | `re_...` | envio do link de recuperação |
| `RESEND_FROM` | `Hora a Hora <contato@seudominio.com.br>` | remetente de domínio verificado |
| `APP_URL` | `https://seu-projeto.vercel.app` | endereço usado no link de redefinição |
| `ALLOW_ADMIN_SELF_REGISTRATION` | `false` | habilite apenas durante a criação do primeiro administrador e desative logo depois |

As variáveis devem ser marcadas pelo menos para **Production**. Recomenda-se marcar também Preview e Development.

### 5. Publique

Clique em **Deploy**. Quando a publicação terminar:

1. Abra `/api/health`; a resposta deve conter `"ok": true`, `"database": "connected"` e `"schema": "ready"`. Se o banco estiver desconectado ou desatualizado, essa rota agora informa o problema corretamente.
2. Se a conta administradora já existe no seu banco, entre normalmente e mantenha `ALLOW_ADMIN_SELF_REGISTRATION` desativada.
3. Somente em um banco novo, defina temporariamente `ALLOW_ADMIN_SELF_REGISTRATION=true`, publique, crie a primeira conta usando exatamente um e-mail de `ADMIN_EMAILS`, remova essa variável e publique novamente.
4. Teste a criação de uma conta comum, login, inclusão de registro, criação de teste, PDF e **Esqueci minha senha**.
5. Em **Settings → Domains**, conecte o domínio definitivo.
6. Se trocar o domínio, atualize `APP_URL` e faça um novo deploy.

O cadastro de usuários comuns fica disponível na própria tela de login. Cada pessoa informa nome, e-mail e senha e entra automaticamente após criar a conta. E-mails definidos em `ADMIN_EMAILS` continuam protegidos e só podem ser usados na criação inicial quando `ALLOW_ADMIN_SELF_REGISTRATION=true`.

## Painel administrativo

Uma conta é administradora se o e-mail estiver em `ADMIN_EMAILS` ou se outro administrador conceder o perfil no painel. O acesso definido por `ADMIN_EMAILS` é identificado como configuração do ambiente e não pode ser removido apenas pelo painel. Somente os e-mails de `TRIAL_CREATOR_EMAILS` (ou, na ausência dessa variável, de `ADMIN_EMAILS`) podem gerar contas de teste. O menu **Administração** permite:

- criar contas de teste que expiram automaticamente após 24 horas;
- gerar e copiar e-mail curto, senha temporária de 8 caracteres e horário exato de expiração;
- buscar usuários por nome ou e-mail;
- listar o nome, o e-mail e o tipo de conta: **Teste**, **Usuário** ou **Administrador**;
- mostrar o dia e o horário do último acesso de cada pessoa, inclusive quando ela retorna com uma sessão ativa;
- mostrar o dia e o horário em que cada usuário ou teste foi criado;
- ativar e desativar contas;
- promover ou remover administradores;
- excluir uma conta e todos os registros associados.

O painel e suas APIs administrativas exibem somente os dados essenciais da conta e o horário do último acesso. Não exibem horas, registros, publicações, estudos, metas, anotações, histórico mensal ou sessões das pessoas. O sistema também impede que um administrador desative, remova o perfil administrativo ou exclua a própria conta. Senhas, hashes e tokens nunca aparecem no painel. No celular, os usuários são exibidos em cartões para evitar rolagem lateral.

As credenciais de uma conta de teste aparecem somente na resposta de criação para que o administrador possa copiá-las. Depois disso, a senha não é recuperável pelo painel. Ao atingir 24 horas, novos logins são bloqueados, sessões existentes deixam de ser aceitas e a própria interface encerra o acesso aberto.

Cada novo teste registra o e-mail do administrador que o criou. O painel mostra essa informação abaixo do e-mail da conta. Solicitações repetidas são bloqueadas para evitar uma segunda conta por clique duplo ou repetição da rede.

## Instalação no Android

Esta edição é uma PWA: não exige APK nem Play Store. Depois de publicada com HTTPS, abra o site no Chrome para Android e toque em **Instalar no Android**. Se o aviso automático não estiver disponível, use **menu do Chrome → Instalar app**. O ícone passa a aparecer na tela inicial e o site abre como aplicativo.

## Segurança implementada

- senhas derivadas com PBKDF2-SHA-256 e salt individual (210 mil iterações);
- cookies de sessão `HttpOnly`, `SameSite=Lax` e `Secure` em produção;
- tokens de sessão e redefinição armazenados apenas como hash;
- link de recuperação expira em 30 minutos e só pode ser usado uma vez;
- resposta genérica na recuperação para não revelar quais e-mails estão cadastrados;
- login compatível com e-mails gravados com letras maiúsculas ou espaços em versões anteriores;
- páginas de login e sessão sem cache, inclusive links de redefinição abertos na PWA;
- contas de teste limitadas no banco, na sessão, no login e nas rotas autenticadas;
- cadastro de usuários comuns aberto, com e-mail normalizado, verificação de duplicidade e sessão automática;
- criação de testes restrita aos administradores principais configurados;
- validação de origem, limite básico de tentativas, limite de tamanho do JSON, bloqueio de solicitações duplicadas e identificação do criador de cada teste;
- cabeçalhos CSP, HSTS, proteção contra incorporação em frames, política de permissões e `nosniff`;
- autorização verificada no servidor e consultas sempre filtradas pelo usuário;
- registro do último acesso atualizado no login, no cadastro e ao reabrir o site com uma sessão válida;
- verificação real da conexão e da estrutura do banco em `/api/health`;
- migrações de integridade com limites no banco, índices de sessão/histórico e vínculo composto entre encontro, estudante e usuário;
- criação de registro que recusa duplicidade, edição com controle de versão e cronômetro aplicado por incremento atômico;
- operações relacionadas de cadastro, redefinição de senha e histórico agrupadas em transações HTTP do Neon;
- exclusão em cascata dos dados quando uma conta é removida.

## Melhorias recomendadas para a próxima fase

- camada distribuída de Vercel WAF/Rate Limiting, complementando o limite local já existente;
- autenticação em dois fatores para administradores;
- trilha de auditoria das ações administrativas;
- backup e política de retenção do banco Neon;
- domínio próprio e monitoramento de erros/uptime;
- termos de uso, política de privacidade e fluxo de exclusão solicitado pelo próprio usuário.
- opção de duplicar um registro recorrente;
- confirmação por e-mail no cadastro e aviso quando a senha for alterada;
- central de ajuda curta, com explicações sobre meta, PDF, instalação e recuperação de senha.
- internacionalização da interface para espanhol e inglês.
