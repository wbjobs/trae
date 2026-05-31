// Copyright Epic Games, Inc. All Rights Reserved.

#include "GrassCulling.h"

DEFINE_LOG_CATEGORY(LogGrassCulling);

#define LOCTEXT_NAMESPACE "FGrassCullingModule"

void FGrassCullingModule::StartupModule()
{
	UE_LOG(LogGrassCulling, Log, TEXT("GrassCulling module started"));
}

void FGrassCullingModule::ShutdownModule()
{
	UE_LOG(LogGrassCulling, Log, TEXT("GrassCulling module shut down"));
}

#undef LOCTEXT_NAMESPACE

IMPLEMENT_MODULE(FGrassCullingModule, GrassCulling)
