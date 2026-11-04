# Acesso e sincronização do Glass Finance

## Escopo de publicação: somente glass-finance

**Correção de vínculo de dados:** o painel Convex do projeto **glass-finance** mostra Production `blissful-capybara-905`, enquanto o bundle publicado anteriormente em Vercel apontava para o backend `ceaseless-mallard-554` de outro ambiente. Antes de qualquer deploy de produção, configure no projeto Vercel **glass-finance** a chave `CONVEX_DEPLOY_KEY` pertencente exclusivamente à produção `blissful-capybara-905` e `VITE_CONVEX_URL=https://blissful-capybara-905.convex.cloud`. O build agora falha explicitamente se o projeto ou as variáveis apontarem para o backend errado. **Não transfira, apague ou mescle dados de deployments sem auditoria e backup.** O painel do Convex de produção estava sem variáveis de autenticação; configure os provedores e a assinatura ali antes da publicação final. Não faça merge na `main` enquanto ambos os projetos Vercel compartilharem esse repositório.


**Projeto correto na Vercel:** `glass-finance` (`prj_4yWAvFx79yXZHGrbipapN22o8mQP`). **Origem pública:** `https://glass-finance-meuacessos-projects.vercel.app`. O projeto `glass-finance-teal` também aponta para o mesmo repositório GitHub; por isso, atualizar a `main` pode publicar nos dois projetos. Evite fazer merge na `main` até separar as configurações de implantação, ou realize uma publicação direcionada apenas ao projeto correto. O callback e a variável `SITE_URL` no Convex devem voltar para **glass-finance**, nunca para `glass-finance-teal`.

## 1. Conectar o site e o Convex

A Vercel publica a aplicação pelo repositório. No projeto **glass-finance**, em **Settings → Environment Variables**, configure `CONVEX_DEPLOY_KEY` para o deployment de produção. O build de produção usa essa chave para publicar as funções e injeta `VITE_CONVEX_URL` no frontend. Em previews, defina uma `VITE_CONVEX_URL` de desenvolvimento que já contenha estas funções.

Em **Convex Dashboard → Production → Settings → Environment Variables**, defina `SITE_URL` como a origem HTTPS pública do app, sem caminho nem barra final. Confira se `JWT_PRIVATE_KEY` e `JWKS` já existem. Para um deployment novo, a configuração inicial do Convex Auth pode ser feita com `npx @convex-dev/auth --prod`. Preserve as chaves de assinatura existentes. O próprio Convex fornece `CONVEX_SITE_URL` para o host HTTP do backend.

## 2. Ativar os provedores

| Opção | Configuração em produção |
| --- | --- |
| Google | Crie um cliente OAuth do tipo **Aplicativo da Web** no Google Cloud. Cadastre a URI exata `https://<deployment>.convex.site/api/auth/callback/google` e a origem pública do app. Salve `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET` no Convex. Se usa `CUSTOM_AUTH_SITE_URL`, cadastre o callback nesse domínio. Para usuários externos, confira o público e o status de publicação no Google. |
| E-mail via Freebuff | Configure `AUTH_EMAIL_API_KEY` com uma chave ativa do serviço já integrado. Rotacione qualquer chave antiga que tenha sido versionada. O nome do app pode ser configurado por `VLY_APP_NAME`. |
| E-mail via Resend | Como alternativa ao Freebuff, verifique um domínio remetente no Resend. No Convex, defina `RESEND_API_KEY` e `AUTH_EMAIL_FROM`, por exemplo `Glass Finance <acesso@seu-dominio.com.br>`. Quando ambos estão configurados, as mensagens são enviadas pelo Resend. |

Os segredos de provedor pertencem somente ao backend. No projeto de produção, o build primeiro consulta o conjunto público de chaves de sessão e verifica se o retorno do Google aponta para o domínio do site. Com essas duas verificações aprovadas, a chave de deploy pode permanecer sem permissão para ler os segredos do Convex. Se falharem, uma credencial autorizada pode conferir os nomes das variáveis e validar a configuração inicial. No projeto `glass-finance`, quando a chave de deploy identifica diretamente o backend de produção `blissful-capybara-905`, o primeiro build preenche a origem pública se ausente e cria o par de assinatura somente se ambas as chaves estiverem ausentes. A gravação inicial não força substituições. Um par incompleto requer restaurar a chave correspondente. A configuração inicial exige pelo menos um provedor configurado. A tela de acesso identifica individualmente as opções disponíveis. A consulta pública `users:authMethods` retorna dois indicadores booleanos, `google` e `emailDelivery`. Eles indicam a presença da configuração. A entrega de um código e o consentimento do Google devem ser testados no domínio final.

## 3. Cadastro e teste no domínio publicado

1. Abra `/auth?modo=cadastro`, cadastre um e-mail que você controla e uma senha de 8 a 128 caracteres. Confirme o código de seis dígitos que chega por e-mail.
2. Escolha um nome de usuário com 3 a 24 letras sem acento, números ou sublinhados. Maiúsculas e minúsculas representam o mesmo nome. A reserva ocorre no servidor após a autenticação. Contas existentes e novos acessos com o Google passam por essa etapa uma vez.
3. Saia e entre com o e-mail e a senha. Repita usando o nome de usuário e a mesma senha. Em **Esqueci minha senha**, solicite outro código e defina uma nova senha. Uma conta criada apenas com Google pode continuar usando o botão Google.
4. Use **Continuar com Google**, autorize o app em uma conta sua e confira o retorno à rota original. Verifique o nome escolhido na tela **Conta**.
5. Crie um lançamento de teste e espere a confirmação de sincronização. Entre com a mesma conta em outro navegador e confira o lançamento. Uma segunda conta deve ter seus próprios registros.

O Glass Finance usa o identificador permanente da conta para novos dados. Na primeira escolha do nome por uma conta antiga, o app seleciona o snapshot mais recentemente salvo por essa conta entre suas sessões anteriores. Históricos independentes de sessões antigas não são combinados. Os contatos salvos pelas sessões da própria conta continuam disponíveis.

Em desenvolvimento, execute `npm run test:auth` para testar os fluxos de autenticação com o transporte de e-mail de teste. Para testar o restante do projeto, use `npm run typecheck`, `npm run test:billing` e `npm run build`.

## 4. Sincronização e conflitos

Os snapshots são isolados pela identidade Convex autenticada e divididos em blocos. Revisões otimizadas por compare-and-swap impedem que uma sessão sobrescreva em silêncio uma revisão mais nova de outro dispositivo. Se houver conflito, o app bloqueia a gravação da sessão conflitante e informa que é necessário exportar o estado e recarregar. A rotina não faz merge campo a campo.

Um snapshot tem limite de 12 MB por conta. O backend confirma as gravações ou retorna erro; o status no painel Conta exibe falha/conflito e oferece uma tentativa manual. Não declare sucesso de sincronização sem verificar o estado “Dados sincronizados com sua conta”. Use exportação periódica como cópia adicional: a nuvem não substitui backup independente.
