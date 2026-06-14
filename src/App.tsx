import { useEffect, useState } from 'react';
import MainWindow from './pages/MainWindow';
import Screenshot from './pages/Screenshot';
import Editor from './pages/Editor';
import Recorder from './pages/Recorder';

function App() {
  const [route, setRoute] = useState<string>(window.location.hash || '#/');

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(window.location.hash || '#/');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const renderPage = () => {
    switch (route) {
      case '#/screenshot':
        return <Screenshot />;
      case '#/editor':
        return <Editor />;
      case '#/recorder':
        return <Recorder />;
      default:
        return <MainWindow />;
    }
  };

  return <div className="w-full h-full">{renderPage()}</div>;
}

export default App;
