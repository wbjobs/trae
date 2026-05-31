using System;
using System.Collections.Generic;
using UnityEngine;

public class GameClient : MonoBehaviour
{
    public static GameClient Instance { get; private set; }

    [SerializeField] private string serverUrl = "ws://localhost:8765";

    private WebSocketClient _wsClient;
    private string _currentBattleId;

    public BattleState CurrentBattleState { get; private set; }

    public event Action<BattleState> OnBattleStateUpdated;
    public event Action<BattleResult> OnActionResult;
    public event Action<string> OnErrorMessage;

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
            return;
        }

        _wsClient = gameObject.AddComponent<WebSocketClient>();
        _wsClient.OnMessageReceived += HandleMessage;
    }

    public void Connect()
    {
        _wsClient.Connect(serverUrl);
    }

    public void Disconnect()
    {
        _wsClient.Disconnect();
    }

    private void HandleMessage(string message)
    {
        try
        {
            var msgData = JsonUtility.FromJson<ServerMessage>(message);

            if (msgData.type == "state_update")
            {
                var stateData = JsonUtility.FromJson<StateUpdateData>(message);
                CurrentBattleState = stateData.data.state;
                OnBattleStateUpdated?.Invoke(CurrentBattleState);
            }
            else
            {
                var result = JsonUtility.FromJson<BattleResult>(message);
                OnActionResult?.Invoke(result);

                if (!result.success && !string.IsNullOrEmpty(result.message))
                {
                    OnErrorMessage?.Invoke(result.message);
                }
            }
        }
        catch (Exception e)
        {
            Debug.LogError($"解析消息失败: {e.Message}");
        }
    }

    public void CreateBattle(List<string> playerUnits, List<string> enemyUnits, 
        string playerAiType = null, string enemyAiType = "minimax", int aiDepth = 3)
    {
        var request = new
        {
            type = "create_battle",
            player_units = playerUnits,
            enemy_units = enemyUnits,
            player_ai_type = playerAiType,
            enemy_ai_type = enemyAiType,
            ai_depth = aiDepth
        };

        _wsClient.Send(request);
    }

    public void StartBattle(string battleId)
    {
        var request = new
        {
            type = "start_battle",
            battle_id = battleId
        };

        _wsClient.Send(request);
    }

    public void ExecuteAction(string battleId, BattleAction action)
    {
        var request = new
        {
            type = "execute_action",
            battle_id = battleId,
            action = action
        };

        _wsClient.Send(request);
    }

    public void EndTurn(string battleId)
    {
        var request = new
        {
            type = "end_turn",
            battle_id = battleId
        };

        _wsClient.Send(request);
    }

    public void GetState(string battleId)
    {
        var request = new
        {
            type = "get_state",
            battle_id = battleId
        };

        _wsClient.Send(request);
    }

    public void GetValidActions(string battleId)
    {
        var request = new
        {
            type = "get_valid_actions",
            battle_id = battleId
        };

        _wsClient.Send(request);
    }

    public void ExecuteAiTurn(string battleId)
    {
        var request = new
        {
            type = "execute_ai_turn",
            battle_id = battleId
        };

        _wsClient.Send(request);
    }

    public void GetStatistics()
    {
        var request = new
        {
            type = "get_statistics"
        };

        _wsClient.Send(request);
    }

    public void StartAiVsAi(string battleId, float delay = 0.5f)
    {
        var request = new
        {
            type = "ai_vs_ai",
            battle_id = battleId,
            delay = delay
        };

        _wsClient.Send(request);
    }

    [System.Serializable]
    private class ServerMessage
    {
        public string type;
    }

    [System.Serializable]
    private class StateUpdateData
    {
        public StateUpdateInner data;
    }

    [System.Serializable]
    private class StateUpdateInner
    {
        public BattleState state;
    }
}
