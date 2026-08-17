import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { AddTransactionSheet, type TransactionFormValues } from "@/components/app/AddTransactionSheet";
import { normalizePaymentMethod } from "@/components/app/PaymentMethodSelector";
import { useAppStore } from "@/lib/app-store";
import type { Transaction } from "@/lib/mock-data";

function transactionToFormValues(transaction: Transaction): TransactionFormValues {
  const payment = normalizePaymentMethod(transaction.paymentMethod);
  const cardMode =
    transaction.cardMode === "credito" || transaction.cardMode === "debito"
      ? transaction.cardMode
      : payment.cardMode;

  return {
    type: transaction.amount >= 0 ? "income" : "expense",
    cents: Math.round(Math.abs(transaction.amount) * 100),
    title: transaction.title,
    categoryId: transaction.categoryId,
    date: transaction.date,
    time: transaction.time ?? "",
    note: transaction.note ?? "",
    attachments: (transaction.attachments ?? []).map((src, index) => ({
      src,
      isImage: src.startsWith("data:image"),
      name: src.startsWith("data:image")
        ? `Imagem ${index + 1}`
        : `Arquivo ${index + 1}`,
    })),
    recurrence: transaction.recurrence ?? "unica",
    frequency: transaction.frequency ?? "mensal",
    daysInterval: transaction.frequencyInterval ?? 15,
    installments: transaction.installments ?? 2,
    currentInstallment: transaction.currentInstallment ?? 1,
    paymentMethod: payment.method,
    cardMode,
    cardId: transaction.cardId ?? null,
    personId: transaction.personId ?? null,
    paymentStatus: transaction.paymentStatus ?? "paid",
  };
}

export default function TransactionEditPage() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const navigate = useNavigate();
  const { visibleTransactions } = useAppStore();
  const [open, setOpen] = useState(true);
  const transaction = visibleTransactions.find((item) => item.id === transactionId);
  const editableTransaction =
    transaction && transaction.source !== "loan" ? transaction : null;

  useEffect(() => {
    if (editableTransaction) return;
    toast.info("Essa transação não está disponível para edição.");
    navigate("/dashboard/transacoes", { replace: true });
  }, [editableTransaction, navigate]);

  if (!editableTransaction) return null;

  return (
    <AddTransactionSheet
      open={open}
      onClose={() => setOpen(false)}
      onExitComplete={() =>
        navigate("/dashboard/transacoes", { replace: true })
      }
      initial={transactionToFormValues(editableTransaction)}
      editTransactionId={editableTransaction.id}
      fullScreen
    />
  );
}
