import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { AddTransactionSheet } from "@/components/app/AddTransactionSheet";
import { transactionToFormValues } from "@/lib/transaction-form-values";
import { useAppStore } from "@/lib/app-store";


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
