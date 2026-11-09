# Notificações push do Glass Finance

## Estado

Código de inscrições, criptografia (VAPID + AES128GCM), push worker e agendamento salvo na branch de desenvolvimento. **Não ativar em produção sem testar no Convex Preview e em um celular real.** O banco de produção não foi alterado por este trabalho.

## Para ativar em um ambiente Convex de testes

1. Confirme que o projeto é **glass-finance**, não **granascan-teste**. Faça um backup recuperável do banco antes de qualquer publicação.
2. Execute localmente `node scripts/generate-vapid.mjs` e guarde o par de chaves em um gerenciador seguro. **Não comite, cole em issues, envie em prints nem registre as chaves privadas em logs.**
3. No deployment de **Preview**, configure `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY` e `PUSH_VAPID_CONTACT` (o contato deve ser `mailto:` seguido de um e-mail real). A chave privada precisa permanecer somente no ambiente do Convex. Não use prefixos VITE_ para a chave privada.
4. Publique as funções de um deployment Preview isolado, depois execute um teste no navegador Android em HTTPS. Faça login, abra **Notificações → Ativar lembretes**, permita notificações e verifique a inscrição. A chave VAPID pública é obtida da consulta autenticada `pushNotifications.getPublicKey`.
5. Verifique a entrega *com o app aberto* usando **Enviar notificação de teste**. Para a entrega *com o app fechado*, abra o app pelo menos uma vez para sincronizar o calendário; execute a ação `pushDelivery.dispatchDue` em Preview no horário adequado (ou aguarde o cron às 9h do fuso cadastrado). Examine os registros do deployment sem imprimir tokens, endpoints ou dados financeiros.
6. Teste desativação, expiração de inscrição (HTTP 404/410), dois dispositivos da mesma conta, duas contas diferentes, vários perfis, pagamentos quitados e restauração de backup.
7. Só depois de verificar o comportamento real no Preview, revise a aprovação e o deployment em produção, sempre explicitamente no projeto **glass-finance**.

## Como funciona

- A permissão é solicitada após o clique do usuário. O navegador cria uma inscrição `PushSubscription` e envia endpoint e chaves públicas de criptografia para o Convex da conta autenticada.
- O app envia ao servidor apenas categorias genéricas e datas de lembretes dentro de uma janela de até 90 dias, até 300 eventos por perfil. Não envia valores, nomes de credores ou descrições para as notificações.
- O cron verifica dispositivos por hora e envia um resumo genérico **às 9h locais**, no máximo uma vez por dispositivo a cada dia com eventos relevantes (um dia antes, no dia do vencimento e até sete dias após).
- Os envios usam Web Push cifrado e autorizado com VAPID; uma inscrição inválida (404 ou 410) é descartada. O recebimento depende do navegador, do sistema operacional, da conexão e das permissões; não há garantia de entrega exata no horário.
- Os lembretes do servidor dependem do calendário sincronizado quando o app foi aberto pela última vez. Não refletem imediatamente alterações feitas com o app fechado em todos os dispositivos.
- Ao desativar, a inscrição é removida do navegador e do banco; ao excluir os dados da conta, inscrições e calendários são apagados.
- O botão de teste local utiliza a permissão do sistema, mas **não comprova** entrega remota. É necessário um teste real do envio pelo Convex Preview.
- O site não lê notificações de bancos ou de outros aplicativos Android; somente os eventos cadastrados no Glass Finance.

## Chaves e segurança

O frontend recebe apenas a chave pública. Nunca envie a chave privada para o navegador nem a configure no Vercel com prefixo `VITE_`. O endpoint registrado é limitado a provedores Web Push conhecidos. Não use os dados de contas financeiras reais nos testes de Preview.
