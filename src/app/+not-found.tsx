import { Redirect } from 'expo-router';

/** Unknown paths (including the hosted web preview's own URL) land on the videos list. */
export default function NotFound() {
  return <Redirect href="/" />;
}
