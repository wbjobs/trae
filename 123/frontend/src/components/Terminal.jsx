import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import socket from '../services/socket';
import 'xterm/css/xterm.css';

const TerminalComponent = ({ containerId, isRunning, onTerminalReady }) => {
  const terminalRef = useRef(null);
  const termRef = useRef(null);
  const fitAddonRef = useRef(null);
  const resizeObserverRef = useRef(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#e0e0e0',
        cursor: '#4ec9b0',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#ffffff',
      },
      scrollback: 10000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    const webLinksAddon = new WebLinksAddon((event, uri) => {
      window.open(uri, '_blank');
    });
    term.loadAddon(webLinksAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    if (onTerminalReady) {
      onTerminalReady({ term, fitAddon });
    }

    term.onData((data) => {
      if (containerId && isRunning) {
        socket.send('input', { data });
      }
    });

    term.onResize(({ cols, rows }) => {
      if (containerId && isRunning) {
        socket.send('resize', { cols, rows });
      }
    });

    const handleResize = () => {
      try {
        fitAddon.fit();
        const size = { cols: term.cols, rows: term.rows };
        if (containerId && isRunning) {
          socket.send('resize', size);
        }
      } catch (err) {
        console.error('Resize error:', err);
      }
    };

    resizeObserverRef.current = new ResizeObserver(handleResize);
    resizeObserverRef.current.observe(terminalRef.current);

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      term.dispose();
    };
  }, []);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.clear();
    }
  }, [containerId]);

  useEffect(() => {
    if (!termRef.current) return;

    const handleOutput = (message) => {
      if (message.data) {
        termRef.current.write(message.data);
      }
    };

    const handleCreated = (message) => {
      termRef.current.writeln(`\r\n\x1b[32m容器已创建: ${message.containerId}\x1b[0m`);
      termRef.current.writeln(`\x1b[32m镜像: ${message.image}\x1b[0m`);
      termRef.current.writeln('');
    };

    const handleDestroyed = (message) => {
      termRef.current.writeln(`\r\n\x1b[31m容器已销毁: ${message.containerId}\x1b[0m`);
    };

    const handleContainerExited = (message) => {
      termRef.current.writeln(`\r\n\x1b[33m容器进程已退出: ${message.containerId}\x1b[0m`);
    };

    const handleError = (message) => {
      termRef.current.writeln(`\r\n\x1b[31m错误: ${message.message}\x1b[0m`);
    };

    socket.on('output', handleOutput);
    socket.on('created', handleCreated);
    socket.on('destroyed', handleDestroyed);
    socket.on('container-exited', handleContainerExited);
    socket.on('error', handleError);

    return () => {
      socket.off('output', handleOutput);
      socket.off('created', handleCreated);
      socket.off('destroyed', handleDestroyed);
      socket.off('container-exited', handleContainerExited);
      socket.off('error', handleError);
    };
  }, [containerId]);

  const getSize = useCallback(() => {
    if (fitAddonRef.current && termRef.current) {
      return { cols: termRef.current.cols, rows: termRef.current.rows };
    }
    return { cols: 80, rows: 24 };
  }, []);

  return (
    <div className="terminal-wrapper">
      <div ref={terminalRef} className="terminal-container" />
    </div>
  );
};

export default TerminalComponent;
