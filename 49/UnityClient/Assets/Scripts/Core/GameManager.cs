using System;
using System.Collections.Generic;
using UnityEngine;

public enum GameMode
{
    PlayerVsAI,
    AIVsAI
}

public class GameManager : MonoBehaviour
{
    public static GameManager Instance { get; private set; }

    public GameMode CurrentMode { get; private set; }
    public string CurrentBattleId { get; private set; }

    public event Action<string> OnBattleCreated;
    public event Action OnBattleStarted;
    public event Action<string> OnBattleEnded;

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

    public void StartPlayerVsAI(List<string> playerUnits, string enemyAiType = "minimax")
    {
        CurrentMode = GameMode.PlayerVsAI;
        var enemyUnits = new List<string> { "warrior", "mage" };

        GameClient.Instance.CreateBattle(playerUnits, enemyUnits, null, enemyAiType);
        GameClient.Instance.OnActionResult += HandleCreateBattleResult;
    }

    public void StartAIVsAI(string aiType1, string aiType2)
    {
        CurrentMode = GameMode.AIVsAI;
        var playerUnits = new List<string> { "warrior", "mage" };
        var enemyUnits = new List<string> { "archer", "tank" };

        GameClient.Instance.CreateBattle(playerUnits, enemyUnits, aiType1, aiType2);
        GameClient.Instance.OnActionResult += HandleCreateBattleResult;
    }

    private void HandleCreateBattleResult(BattleResult result)
    {
        if (result.success && result.data != null && result.data.ContainsKey("battle_id"))
        {
            CurrentBattleId = result.data["battle_id"].ToString();
            OnBattleCreated?.Invoke(CurrentBattleId);

            GameClient.Instance.OnActionResult -= HandleCreateBattleResult;

            GameClient.Instance.StartBattle(CurrentBattleId);
            GameClient.Instance.OnActionResult += HandleStartBattleResult;
        }
    }

    private void HandleStartBattleResult(BattleResult result)
    {
        if (result.success)
        {
            OnBattleStarted?.Invoke();
            GameClient.Instance.OnActionResult -= HandleStartBattleResult;

            if (CurrentMode == GameMode.AIVsAI)
            {
                GameClient.Instance.StartAiVsAi(CurrentBattleId, 0.5f);
            }
        }
    }

    public void ExecutePlayerAction(BattleAction action)
    {
        if (CurrentMode == GameMode.PlayerVsAI && !string.IsNullOrEmpty(CurrentBattleId))
        {
            GameClient.Instance.ExecuteAction(CurrentBattleId, action);
        }
    }

    public void EndPlayerTurn()
    {
        if (CurrentMode == GameMode.PlayerVsAI && !string.IsNullOrEmpty(CurrentBattleId))
        {
            GameClient.Instance.EndTurn(CurrentBattleId);
        }
    }

    public void TriggerAITurn()
    {
        if (!string.IsNullOrEmpty(CurrentBattleId))
        {
            GameClient.Instance.ExecuteAiTurn(CurrentBattleId);
        }
    }

    public void Disconnect()
    {
        GameClient.Instance.Disconnect();
    }
}
