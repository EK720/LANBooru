export default function NotFoundPage() {
  return (
    <div style={{
      textAlign: 'center',
      padding: '4rem 1rem',
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <h1 style={{ fontSize: '4rem', margin: '0 0 1rem' }}>404</h1>
      <p style={{ fontSize: '2rem', margin: '0 0 1.5rem' }}>Nobody here but us chickens!</p>
      <a href="/" style={{ color: '#0ea5e9' }}>Go Home</a>
    </div>
  );
}
