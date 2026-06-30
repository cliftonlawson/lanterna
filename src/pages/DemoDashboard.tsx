import { ClaudeDashboard } from './ClaudeDashboard';

type Props = {
  onSignUp: () => void;
  onBack: () => void;
};

export function DemoDashboard({ onSignUp, onBack }: Props) {
  return <ClaudeDashboard onSignUp={onSignUp} onBack={onBack} />;
}
