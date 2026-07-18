import { ClaudeDashboard } from './ClaudeDashboard';

type Props = {
  onSignUp: () => void;
  onBack: () => void;
};

export function DemoDashboard({ onSignUp, onBack }: Props) {
  return <ClaudeDashboard demo onSignUp={onSignUp} onBack={onBack} />;
}
