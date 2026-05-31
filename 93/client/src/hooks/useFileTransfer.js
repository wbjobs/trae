import { useState, useRef, useCallback, useEffect } from 'react';

export function useFileTransfer(webrtc) {
  const [file, setFile] = useState(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [sentChunks, setSentChunks] = useState(0);
  const [receivedChunks, setReceivedChunks] = useState(0);
  const [chunkStatus, setChunkStatus] = useState([]);
  const [retransmitCount, setRetransmitCount] = useState(0);
  const [incomingFile, setIncomingFile] = useState(null);
  const [receivedFile, setReceivedFile] = useState(null);
  const [isPreparing, setIsPreparing] = useState(false);
  
  const sentChunkSetRef = useRef(new Set());
  const retransmitSetRef = useRef(new Set());
  const currentIndexRef = useRef(0);
  const transferIntervalRef = useRef(null);

  const resetTransfer = useCallback(() => {
    setFile(null);
    setIsTransferring(false);
    setProgress(0);
    setTotalChunks(0);
    setSentChunks(0);
    setReceivedChunks(0);
    setChunkStatus([]);
    setRetransmitCount(0);
    setIncomingFile(null);
    setReceivedFile(null);
    setIsPreparing(false);
    sentChunkSetRef.current.clear();
    retransmitSetRef.current.clear();
    currentIndexRef.current = 0;
    if (transferIntervalRef.current) {
      clearInterval(transferIntervalRef.current);
      transferIntervalRef.current = null;
    }
    webrtc.cleanupTransfer();
  }, [webrtc]);

  const selectFile = useCallback((selectedFile) => {
    resetTransfer();
    setFile(selectedFile);
  }, [resetTransfer]);

  const prepareAndSendFile = useCallback(async () => {
    if (!file || !webrtc.isConnected) return;
    
    setIsPreparing(true);
    
    try {
      const { chunkHashes, totalChunks: chunks } = await webrtc.prepareFileChunks(
        file,
        (processed, total) => {
          const prepProgress = Math.round((processed / total) * 100);
          setProgress(prepProgress);
        }
      );
      
      setTotalChunks(chunks);
      setChunkStatus(new Array(chunks).fill(null).map(() => ({ status: 'pending', retransmitted: false })));
      
      webrtc.sendFileMetadata(file, chunkHashes, chunks);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      startTransferLoop(chunks);
    } catch (error) {
      console.error('文件准备失败:', error);
      setIsPreparing(false);
    }
  }, [file, webrtc]);

  const startTransferLoop = useCallback((totalChunks) => {
    setIsTransferring(true);
    setIsPreparing(false);
    setProgress(0);
    currentIndexRef.current = 0;
    
    const WINDOW_SIZE = 50;
    const STALE_TIMEOUT = 3000;
    let isSending = false;
    let isProcessing = false;
    
    webrtc.setChunkAckHandler((index, hash, isValid, duplicate) => {
      if (duplicate) {
        webrtc.markChunkAcked(index);
        return;
      }
      
      if (isValid) {
        webrtc.markChunkAcked(index);
        sentChunkSetRef.current.add(index);
        setSentChunks(sentChunkSetRef.current.size);
        const progress = Math.round((sentChunkSetRef.current.size / totalChunks) * 100);
        setProgress(progress);
        
        setChunkStatus(prev => {
          const newStatus = [...prev];
          if (newStatus[index]) {
            newStatus[index] = {
              status: 'success',
              retransmitted: newStatus[index].retransmitted
            };
          }
          return newStatus;
        });
        
        if (sentChunkSetRef.current.size === totalChunks) {
          setIsTransferring(false);
          setTimeout(() => {
            webrtc.sendFileComplete();
          }, 500);
        }
      } else {
        retransmitSetRef.current.add(index);
        setRetransmitCount(prev => prev + 1);
        setChunkStatus(prev => {
          const newStatus = [...prev];
          if (newStatus[index]) {
            newStatus[index] = {
              status: 'pending',
              retransmitted: true
            };
          }
          return newStatus;
        });
      }
    });
    
    const processTransferCycle = async () => {
      if (isProcessing) return;
      isProcessing = true;
      
      try {
        const retransmitQueue = webrtc.getRetransmitQueue();
        
        if (retransmitQueue.size > 0) {
          const indices = Array.from(retransmitQueue);
          for (const index of indices) {
            if (!sentChunkSetRef.current.has(index)) {
              const sent = await webrtc.sendChunk(index, true);
              if (sent) {
                if (!retransmitSetRef.current.has(index)) {
                  retransmitSetRef.current.add(index);
                  setRetransmitCount(prev => prev + 1);
                }
                setChunkStatus(prev => {
                  const newStatus = [...prev];
                  if (newStatus[index]) {
                    newStatus[index] = {
                      status: 'pending',
                      retransmitted: true
                    };
                  }
                  return newStatus;
                });
              }
            }
          }
          retransmitQueue.clear();
        }
        
        const staleChunks = webrtc.getStaleChunks(STALE_TIMEOUT);
        for (const index of staleChunks) {
          if (!sentChunkSetRef.current.has(index)) {
            const sent = await webrtc.sendChunk(index, true);
            if (sent && !retransmitSetRef.current.has(index)) {
              retransmitSetRef.current.add(index);
              setRetransmitCount(prev => prev + 1);
              setChunkStatus(prev => {
                const newStatus = [...prev];
                if (newStatus[index]) {
                  newStatus[index] = {
                    status: 'pending',
                    retransmitted: true
                  };
                }
                return newStatus;
              });
            }
          }
        }
        
        const inFlightCount = webrtc.getInFlightChunks().size;
        const windowAvailable = WINDOW_SIZE - inFlightCount;
        
        if (windowAvailable > 0 && !isSending) {
          isSending = true;
          let sentCount = 0;
          while (currentIndexRef.current < totalChunks && 
                 !sentChunkSetRef.current.has(currentIndexRef.current) &&
                 sentCount < windowAvailable) {
            const success = await webrtc.sendChunk(currentIndexRef.current);
            if (success) {
              sentCount++;
              currentIndexRef.current++;
            } else {
              break;
            }
          }
          isSending = false;
        }
      } catch (error) {
        console.error('传输循环错误:', error);
      } finally {
        isProcessing = false;
      }
    };
    
    transferIntervalRef.current = setInterval(processTransferCycle, 50);
  }, [webrtc]);

  const setupReceiveHandlers = useCallback(() => {
    webrtc.setFileMetadataHandler((metadata) => {
      setIncomingFile(metadata);
      setTotalChunks(metadata.chunkCount);
      setChunkStatus(new Array(metadata.chunkCount).fill(null).map(() => ({ status: 'pending', retransmitted: false })));
      setReceivedChunks(0);
      setProgress(0);
      setRetransmitCount(0);
      setIsTransferring(true);
    });

    webrtc.setChunkReceivedHandler((index, isValid, hash) => {
      setReceivedChunks(prev => {
        const newCount = prev + (isValid ? 1 : 0);
        const metadata = webrtc.getFileMetadata();
        if (metadata) {
          setProgress(Math.round((newCount / metadata.chunkCount) * 100));
        }
        return newCount;
      });
      
      if (isValid) {
        setChunkStatus(prev => {
          const newStatus = [...prev];
          if (newStatus[index]) {
            newStatus[index] = {
              status: 'success',
              retransmitted: newStatus[index].retransmitted
            };
          }
          return newStatus;
        });
      } else {
        setRetransmitCount(prev => prev + 1);
        setChunkStatus(prev => {
          const newStatus = [...prev];
          if (newStatus[index]) {
            newStatus[index] = {
              status: 'pending',
              retransmitted: true
            };
          }
          return newStatus;
        });
      }
    });

    webrtc.setFileCompleteHandler((blob, metadata) => {
      setIsTransferring(false);
      setReceivedFile({ blob, metadata });
    });
  }, [webrtc]);

  const downloadFile = useCallback(() => {
    if (!receivedFile) return;
    
    const url = URL.createObjectURL(receivedFile.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = receivedFile.metadata.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [receivedFile]);

  useEffect(() => {
    return () => {
      if (transferIntervalRef.current) {
        clearInterval(transferIntervalRef.current);
      }
    };
  }, []);

  return {
    file,
    isTransferring,
    isPreparing,
    progress,
    totalChunks,
    sentChunks,
    receivedChunks,
    chunkStatus,
    retransmitCount,
    incomingFile,
    receivedFile,
    selectFile,
    prepareAndSendFile,
    setupReceiveHandlers,
    downloadFile,
    resetTransfer
  };
}
