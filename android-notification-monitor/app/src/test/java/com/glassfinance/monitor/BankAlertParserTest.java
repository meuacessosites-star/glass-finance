package com.glassfinance.monitor;

import org.junit.Test;
import static org.junit.Assert.*;

public class BankAlertParserTest {
    @Test public void receivesPix() {
        BankAlertParser.Alert result = BankAlertParser.parse(
            "com.nu.production", "Pix recebido", "Você recebeu um Pix de R$ 150,00");
        assertNotNull(result);
        assertEquals("RECEITA", result.kind);
        assertEquals(Long.valueOf(15000), result.amountCents);
    }

    @Test public void detectsExpense() {
        BankAlertParser.Alert result = BankAlertParser.parse(
            "br.com.intermedium", "Compra aprovada", "Compra aprovada no valor de R$ 1.234,56");
        assertNotNull(result);
        assertEquals("DESPESA", result.kind);
        assertEquals(Long.valueOf(123456), result.amountCents);
    }

    @Test public void neverReadsNonBank() {
        assertNull(BankAlertParser.parse("com.whatsapp", "Pix recebido", "R$ 500,00"));
    }

    @Test public void ignoresPromotions() {
        assertNull(BankAlertParser.parse(
            "com.picpay", "Promoção", "Aproveite oferta especial de Pix recebido"));
    }

    @Test public void ignoresBalances() {
        assertNull(BankAlertParser.parse(
            "br.com.bb.android", "Seu saldo", "Saldo atualizado: R$ 10,00"));
    }

    @Test public void ambiguousAmountsRemainUnfilled() {
        BankAlertParser.Alert result = BankAlertParser.parse(
            "com.mercadopago.wallet", "Pix realizado",
            "Pix realizado: R$ 20,00. Saldo disponível: R$ 40,00");
        assertNotNull(result);
        assertEquals("DESPESA", result.kind);
        assertNull(result.amountCents);
    }

    @Test public void missingAmountsAreNotInvented() {
        BankAlertParser.Alert result = BankAlertParser.parse(
            "com.nu.production", "Pix recebido", "Você recebeu um Pix");
        assertNotNull(result);
        assertNull(result.amountCents);
    }

    @Test public void unsupportedBankPackageIsNotIncluded() {
        assertFalse(BankAlertParser.isSupportedBank("com.example.notabank"));
        assertEquals(5, BankAlertParser.supportedBanks().size());
    }
}
