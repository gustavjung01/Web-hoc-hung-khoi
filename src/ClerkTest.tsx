import { ClerkProvider, SignInButton, UserButton, useUser, SignedIn, SignedOut } from '@clerk/clerk-react';

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function TestContent() {
  const { user, isLoaded } = useUser();
  
  if (!isLoaded) {
    return <div>Loading...</div>;
  }
  
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h1>Clerk Auth Test</h1>
      <SignedIn>
        <p>✅ Signed in as: {user?.primaryEmailAddress?.emailAddress}</p>
        <UserButton />
      </SignedIn>
      <SignedOut>
        <p>❌ Not signed in</p>
        <SignInButton mode="modal">
          <button style={{ padding: '10px 20px', fontSize: '16px' }}>
            Sign In
          </button>
        </SignInButton>
      </SignedOut>
      <hr style={{ margin: '20px 0' }} />
      <a href="/" style={{ color: 'blue' }}>← Back to Home</a>
    </div>
  );
}

export default function ClerkTest() {
  if (!clerkKey || clerkKey.endsWith('_xxx')) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        <h1>Clerk Key Missing</h1>
        <p>VITE_CLERK_PUBLISHABLE_KEY not found or invalid</p>
        <a href="/">← Back to Home</a>
      </div>
    );
  }

  return (
    <ClerkProvider publishableKey={clerkKey}>
      <TestContent />
    </ClerkProvider>
  );
}
