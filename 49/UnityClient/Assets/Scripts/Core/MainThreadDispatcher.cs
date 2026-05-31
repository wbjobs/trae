using System;
using System.Collections.Generic;
using UnityEngine;

public class MainThreadDispatcher : MonoBehaviour
{
    public static MainThreadDispatcher Instance { get; private set; }

    private Queue<Action> _actionQueue = new Queue<Action>();
    private object _lock = new object();

    private void Awake()
    {
        if (Instance == null)
        {
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }
        else
        {
            Destroy(gameObject);
        }
    }

    public void Enqueue(Action action)
    {
        lock (_lock)
        {
            _actionQueue.Enqueue(action);
        }
    }

    private void Update()
    {
        lock (_lock)
        {
            while (_actionQueue.Count > 0)
            {
                _actionQueue.Dequeue()?.Invoke();
            }
        }
    }
}
