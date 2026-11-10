# Glass Finance — APK pessoal com monitor experimental

**Status: protótipo isolado, não integrado ao Glass Finance em produção.**

Este APK compartilhável oferece um botão **Abrir Glass Finance** (abre o site oficial no navegador seguro do Android) e testa a leitura **local** de avisos financeiros. Não incorpora todos os arquivos do site nem oferece uso offline.
É um aplicativo separado apenas durante a fase experimental: **não modifica** o
PWA, login, Convex, banco de dados, saldos, contas, histórico ou transações do site.

## Limites intencionais

- Não contém permissão de internet (não envia nada para servidores).
- O acesso a notificações exige consentimento explícito na tela de configurações do Android.
- Examina apenas os avisos de pacotes bancários que constam da lista de permissão
  do código. A lista inicial tem Nubank, Inter, Banco do Brasil, PicPay e Mercado Pago.
  Pacotes podem variar por versão/país; confirmar antes de uso real.
- Tenta identificar eventos claramente relacionados a Pix, compra e pagamento;
  valores incertos ficam em branco. Pode haver falsos positivos/negativos.
- Não armazena nomes de pessoas, texto integral, saldo disponível nem dados
  de outras notificações. Mantém apenas banco, tipo, valor opcional, data e
  hash do identificador do evento (máximo de 100 itens no dispositivo).
- Não cadastra transações automaticamente, não consulta dados do banco e **não**
  sincroniza a caixa de entrada do Glass Finance.
- O acesso pode ser revogado em Configurações do Android > Acesso a notificações.
  O histórico local pode ser apagado no próprio aplicativo.

## Compilar/testar (Android SDK necessário)

Com Android SDK e JDK 17 instalados, na pasta `android-notification-monitor`:

```sh
gradle :app:testDebugUnitTest :app:assembleDebug
```

Foi usado Android Gradle Plugin 8.5.2 e Gradle 8.7. Não há APK
pré-compilado neste repositório. Executar testes de unidade e verificar
manualmente, em aparelho de teste próprio, antes de instalar em um celular principal.

## Próxima etapa, **somente após validação**

1. Testar com dados e notificações de demonstração; não usar notificações reais de
   terceiros e nunca enviar códigos de autenticação ou conteúdo integral.
2. Revisar consentimento, revogação, regras antifraude e deduplicação.
3. Criar uma API autenticada e isolada, em ambiente de teste, para registrar
   **sugestões pendentes**, sem tocar nas tabelas financeiras de produção.
4. Confirmar que o site consegue visualizar, aprovar e rejeitar uma sugestão sem
   criar transações duplicadas.
5. Somente depois de aprovação e testes, avaliar inclusão no produto.

A distribuição pode ser feita diretamente pelo APK de teste gerado no GitHub Actions. É um APK debug de avaliação, não um pacote de lançamento assinado com chave privada; não é recomendado para distribuição pública ampla. Revise os avisos de segurança do Android e instale apenas builds próprios e confiáveis.

O PWA instalado pelo navegador nunca poderá receber a permissão nativa
`NotificationListenerService` apenas por alteração de código web.
