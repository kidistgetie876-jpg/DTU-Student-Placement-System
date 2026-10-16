import React from 'react';
import Header from './Header.jsx';
import Footer from './Footer.jsx';
import './PublicLayout.css';

function PublicLayout({ children, isLogin = false, mainClassName = '' }) {
  return (
    <div className={`public-layout${isLogin ? ' login-route-shell' : ''}`}>
      <Header />
      <main className={`public-layout-main ${mainClassName}`.trim()}>
        {children}
      </main>
      <Footer />
    </div>
  );
}

export default PublicLayout;
