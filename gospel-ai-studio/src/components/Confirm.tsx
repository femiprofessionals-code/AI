import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Modal } from "./Modal";

interface Options {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  checkbox?: string;
}
interface Result { ok: boolean; checked: boolean }

const Ctx = createContext<(o: Options) => Promise<Result>>(async () => ({ ok: false, checked: false }));

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<{ o: Options; resolve: (r: Result) => void } | null>(null);
  const [checked, setChecked] = useState(false);
  const confirm = useCallback((o: Options) => new Promise<Result>((resolve) => {
    setChecked(false);
    setReq({ o, resolve });
  }), []);
  const done = (ok: boolean) => {
    req?.resolve({ ok, checked });
    setReq(null);
  };
  return (
    <Ctx.Provider value={confirm}>
      {children}
      {req && (
        <Modal
          title={req.o.title}
          onClose={() => done(false)}
          footer={
            <>
              <button className="btn" onClick={() => done(false)}>Cancel</button>
              <button className={`btn ${req.o.danger ? "btn-danger" : "btn-primary"}`} onClick={() => done(true)}>
                {req.o.confirmLabel ?? "Confirm"}
              </button>
            </>
          }
        >
          <div className="confirm-msg">{req.o.message}</div>
          {req.o.checkbox && (
            <label className="check">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
              <span>{req.o.checkbox}</span>
            </label>
          )}
        </Modal>
      )}
    </Ctx.Provider>
  );
}

export const useConfirm = () => useContext(Ctx);
