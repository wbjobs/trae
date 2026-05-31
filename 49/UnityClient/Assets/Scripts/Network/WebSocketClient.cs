using System;
using System.Collections.Generic;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;
using WebSocketSharp;

public class WebSocketClient : MonoBehaviour
{
    private WebSocket _ws;
    private string _serverUrl;
    private Queue<string> _messageQueue = new Queue<string>();
    private object _lock = new object();

    public event Action<string> OnMessageReceived;
    public event Action OnConnected;
    public event Action<string> OnDisconnected;
    public event Action<string> OnError;

    public bool IsConnected => _ws != null && _ws.IsAlive;

    public void Connect(string url)
    {
        _serverUrl = url;
        _ws = new WebSocket(url);

        _ws.OnOpen += (sender, e) =>
        {
            Debug.Log("WebSocket 已连接");
            MainThreadDispatcher.Instance.Enqueue(() => OnConnected?.Invoke());
        };

        _ws.OnMessage += (sender, e) =>
        {
            if (e.IsText)
            {
                lock (_lock)
                {
                    _messageQueue.Enqueue(e.Data);
                }
            }
        };

        _ws.OnError += (sender, e) =>
        {
            Debug.LogError($"WebSocket 错误: {e.Message}");
            MainThreadDispatcher.Instance.Enqueue(() => OnError?.Invoke(e.Message));
        };

        _ws.OnClose += (sender, e) =>
        {
            Debug.Log($"WebSocket 已关闭: {e.Reason}");
            MainThreadDispatcher.Instance.Enqueue(() => OnDisconnected?.Invoke(e.Reason));
        };

        _ws.ConnectAsync();
    }

    public void Disconnect()
    {
        if (_ws != null)
        {
            _ws.Close();
            _ws = null;
        }
    }

    public void Send(string message)
    {
        if (_ws != null && _ws.IsAlive)
        {
            _ws.SendAsync(message, (success) =>
            {
                if (!success)
                {
                    Debug.LogError("发送消息失败");
                }
            });
        }
        else
        {
            Debug.LogWarning("WebSocket 未连接");
        }
    }

    public void Send(object data)
    {
        string json = JsonUtility.ToJson(data);
        Send(json);
    }

    private void Update()
    {
        lock (_lock)
        {
            while (_messageQueue.Count > 0)
            {
                string message = _messageQueue.Dequeue();
                OnMessageReceived?.Invoke(message);
            }
        }
    }

    private void OnDestroy()
    {
        Disconnect();
    }
}
