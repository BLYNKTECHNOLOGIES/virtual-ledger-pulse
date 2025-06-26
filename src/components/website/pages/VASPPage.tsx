
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function VASPPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to the new comprehensive VASP homepage
    navigate('/website/vasp-home', { replace: true });
  }, [navigate]);

  return null;
}
