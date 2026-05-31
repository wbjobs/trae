// Copyright Epic Games, Inc. All Rights Reserved.

#include "GrassStatWidget.h"
#include "GrassManager.h"
#include "Components/TextBlock.h"
#include "Components/ProgressBar.h"
#include "Components/CanvasPanel.h"

void UGrassStatWidget::NativeConstruct()
{
	Super::NativeConstruct();

	UpdateInterval = 0.25f;
	bShowOnScreen = true;
	TimeSinceLastUpdate = 0.0f;

	UpdateStatsDisplay();
}

void UGrassStatWidget::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
	Super::NativeTick(MyGeometry, InDeltaTime);

	TimeSinceLastUpdate += InDeltaTime;

	if (TimeSinceLastUpdate >= UpdateInterval)
	{
		UpdateStatsDisplay();
		TimeSinceLastUpdate = 0.0f;
	}
}

void UGrassStatWidget::SetGrassManager(AGrassManager* InManager)
{
	GrassManager = InManager;
	UpdateStatsDisplay();
}

void UGrassStatWidget::UpdateStatsDisplay()
{
	if (!GrassManager)
	{
		if (StatsText)
		{
			StatsText->SetText(FText::FromString(TEXT("GrassManager not set")));
		}
		return;
	}

	const int32 Total = GrassManager->GetTotalCount();
	const int32 Rendered = GrassManager->GetRenderedCount();
	const float Efficiency = GrassManager->GetCullingEfficiency();
	const int32 Culled = Total - Rendered;

	if (CountText)
	{
		const FString CountStr = FString::Printf(
			TEXT("Total: %d | Rendered: %d | Culled: %d"),
			Total,
			Rendered,
			Culled
		);
		CountText->SetText(FText::FromString(CountStr));
	}

	if (EfficiencyText)
	{
		const FString EfficiencyStr = FString::Printf(
			TEXT("Efficiency: %.1f%%"),
			Efficiency * 100.0f
		);
		EfficiencyText->SetText(FText::FromString(EfficiencyStr));
	}

	if (EfficiencyBar)
	{
		EfficiencyBar->SetPercent(Efficiency);
	}

	if (StatsText)
	{
		StatsText->SetText(FText::FromString(GrassManager->GetStatsString()));
	}
}

void UGrassStatWidget::ToggleVisibility()
{
	bShowOnScreen = !bShowOnScreen;
	SetVisibility(bShowOnScreen ? ESlateVisibility::Visible : ESlateVisibility::Collapsed);
}
