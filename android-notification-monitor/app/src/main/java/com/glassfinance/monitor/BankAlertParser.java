package com.glassfinance.monitor;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.Normalizer;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Offline and deliberately conservative. No personal notification text is returned or stored.
 * Only packages from this explicit allowlist are ever parsed.
 */
public final class BankAlertParser {
    private static final Map<String, String> BANKS;
    private static final Pattern AMOUNT = Pattern.compile(
        "(?:R\\$\\s*|BRL\\s*)(\\d{1,3}(?:\\.\\d{3})*,\\d{2}|\\d+,\\d{2}|\\d+\\.\\d{2})",
        Pattern.CASE_INSENSITIVE
    );

    static {
        Map<String, String> banks = new LinkedHashMap<>();
        banks.put("com.nu.production", "Nubank");
        banks.put("br.com.intermedium", "Inter");
        banks.put("br.com.bb.android", "Banco do Brasil");
        banks.put("com.picpay", "PicPay");
        banks.put("com.mercadopago.wallet", "Mercado Pago");
        BANKS = Collections.unmodifiableMap(banks);
    }

    private BankAlertParser() {}

    public static boolean isSupportedBank(String packageName) {
        return BANKS.containsKey(packageName);
    }

    public static Map<String, String> supportedBanks() {
        return BANKS;
    }

    /**
     * A null result means the notice is unrelated/ambiguous. Amount can be null for
     * a legitimate event where the bank does not reveal a single unambiguous value.
     */
    public static Alert parse(String packageName, String title, String body) {
        String bank = BANKS.get(packageName);
        if (bank == null) return null;

        String message = normalize(safe(title) + " " + safe(body));
        if (message.isEmpty()) return null;

        // Reject advertising: a marketing message about Pix is not a real transaction.
        if (containsAny(message, "promocao", "oferta especial", "aproveite", "ganhe desconto",
                "voce pode ganhar", "simule", "conheca nosso", "peca seu cartao")) {
            return null;
        }

        boolean incoming = containsAny(message,
            "pix recebido", "recebeu um pix", "voce recebeu um pix",
            "transferencia recebida", "deposito recebido",
            "pagamento recebido", "valor recebido", "recebimento confirmado");
        boolean outgoing = containsAny(message,
            "pix enviado", "pix realizado", "pix feito", "pix pago",
            "transferencia enviada", "transferencia realizada",
            "compra aprovada", "compra realizada", "compra no cartao",
            "pagamento realizado", "pagamento efetuado", "pagamento aprovado",
            "debito realizado", "boleto pago");

        // Conflicting directions must be reviewed by a human instead of guessed.
        if (!incoming && !outgoing) return null;
        String kind = incoming && !outgoing ? "RECEITA"
                : outgoing && !incoming ? "DESPESA" : "CONFERIR";
        Set<Long> amounts = new LinkedHashSet<>();
        Matcher matcher = AMOUNT.matcher(safe(title) + " " + safe(body));
        while (matcher.find()) {
            try {
                String value = matcher.group(1);
                String decimal = value.contains(",")
                        ? value.replace(".", "").replace(",", ".") : value;
                BigDecimal cents = new BigDecimal(decimal)
                    .movePointRight(2).setScale(0, RoundingMode.UNNECESSARY);
                long parsed = cents.longValueExact();
                if (parsed > 0 && parsed <= 100_000_000_000L) amounts.add(parsed);
            } catch (ArithmeticException | NumberFormatException ignored) {
                // Missing or invalid values are never assumed.
            }
        }
        Long amountCents = amounts.size() == 1 ? amounts.iterator().next() : null;
        return new Alert(bank, kind, amountCents);
    }

    private static boolean containsAny(String text, String... terms) {
        for (String term : terms) if (text.contains(term)) return true;
        return false;
    }

    private static String safe(String value) {
        return value == null ? "" : value.substring(0, Math.min(value.length(), 400));
    }

    private static String normalize(String value) {
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFD);
        normalized = normalized.replaceAll("\\p{M}+", "");
        return normalized.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ").trim();
    }

    public static final class Alert {
        public final String bank;
        public final String kind;
        public final Long amountCents;

        Alert(String bank, String kind, Long amountCents) {
            this.bank = bank;
            this.kind = kind;
            this.amountCents = amountCents;
        }
    }
}
