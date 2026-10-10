import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ErrorMessage } from "../../components/ErrorMessage";
import { notifyError } from "../../lib/feedback";
import { withRequestDeadline } from "../../lib/request-state";

export const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    withRequestDeadline(() => supabase.auth.getSession()).then(({ data: { session }, error }) => {
      if (!active) return;
      if (error) throw error;
      if (session) {
        navigate("/", { replace: true });
      } else {
        notifyError("Liên kết đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.");
        navigate("/login", { replace: true });
      }
    }).catch(error => { if (active) { setError(error); notifyError(error); } });
    return () => { active = false; };
  }, [navigate, attempt]);

  if (error) return <div className="container mt-4"><ErrorMessage error={error} onRetry={() => { setError(null); setAttempt(attempt + 1); }} /></div>;

  return <LoadingSpinner message="Đang xử lý đăng nhập..." />;
};
