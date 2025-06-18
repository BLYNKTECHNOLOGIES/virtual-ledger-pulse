
import { MinimizedDialogIcon } from "./MinimizedDialogIcon";
import { useMinimizedDialogs } from "@/hooks/useMinimizedDialogs";

interface MinimizedDialogsContainerProps {
  onRestoreDialog: (id: string, type: string) => void;
}

export function MinimizedDialogsContainer({ onRestoreDialog }: MinimizedDialogsContainerProps) {
  const { minimizedDialogs, removeDialog } = useMinimizedDialogs();

  const handleRestore = (id: string, type: string) => {
    onRestoreDialog(id, type);
  };

  return (
    <>
      {minimizedDialogs.map((dialog, index) => (
        <MinimizedDialogIcon
          key={dialog.id}
          title={dialog.title}
          type={dialog.type}
          index={index}
          onClick={() => handleRestore(dialog.id, dialog.type)}
          onRemove={() => removeDialog(dialog.id)}
        />
      ))}
    </>
  );
}
