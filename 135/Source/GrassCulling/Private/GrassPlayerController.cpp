// Copyright Epic Games, Inc. All Rights Reserved.

#include "GrassPlayerController.h"
#include "GrassManager.h"
#include "GrassStatWidget.h"
#include "InputAction.h"
#include "InputMappingContext.h"

AGrassPlayerController::AGrassPlayerController()
{
	StatWidgetClass = nullptr;
	StatWidgetTag = TEXT("GrassStats");
	ToggleStatsAction = nullptr;
	InputMappingContext = nullptr;
	InputMappingPriority = 0;
	StatWidget = nullptr;
	GrassManager = nullptr;
}

void AGrassPlayerController::BeginPlay()
{
	Super::BeginPlay();

	if (StatWidgetClass)
	{
		StatWidget = CreateWidget<UGrassStatWidget>(this, StatWidgetClass);
		if (StatWidget)
		{
			StatWidget->AddToViewport();
			StatWidget->SetVisibility(ESlateVisibility::Visible);
		}
	}
}

void AGrassPlayerController::SetupInputComponent()
{
	Super::SetupInputComponent();
}

void AGrassPlayerController::ToggleStatsDisplay()
{
	if (StatWidget)
	{
		StatWidget->ToggleVisibility();
	}
}

void AGrassPlayerController::SetGrassManager(AGrassManager* InManager)
{
	GrassManager = InManager;
	if (StatWidget && GrassManager)
	{
		StatWidget->SetGrassManager(GrassManager);
	}
}
