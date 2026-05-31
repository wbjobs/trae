// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "GrassTypes.h"
#include "GrassManager.generated.h"

class UInstancedStaticMeshComponent;
class USceneComponent;
class UGrassData;
class UMaterialParameterCollection;
class UTextureRenderTarget2D;
class USceneCaptureComponent2D;

UCLASS(BlueprintType)
class GRASSCULLING_API AGrassManager : public AActor
{
	GENERATED_BODY()

public:
	AGrassManager();

	virtual void OnConstruction(const FTransform& Transform) override;

	virtual void BeginPlay() override;

	virtual void Tick(float DeltaSeconds) override;

	UPROPERTY(VisibleAnywhere, Category = "Components")
	USceneComponent* SceneRoot;

	UPROPERTY(VisibleAnywhere, Category = "Components")
	UInstancedStaticMeshComponent* CloseISM;

	UPROPERTY(VisibleAnywhere, Category = "Components")
	UInstancedStaticMeshComponent* MediumISM;

	UPROPERTY(VisibleAnywhere, Category = "Components")
	UInstancedStaticMeshComponent* FarISM;

	UPROPERTY(VisibleAnywhere, Category = "Components")
	UInstancedStaticMeshComponent* ImpostorISM;

	UPROPERTY(EditAnywhere, Category = "Grass|Config")
	UGrassData* GrassConfig;

	UPROPERTY(VisibleAnywhere, Category = "Grass|Stats")
	int32 TotalGrassCount;

	UPROPERTY(VisibleAnywhere, Category = "Grass|Stats")
	int32 CloseCount;

	UPROPERTY(VisibleAnywhere, Category = "Grass|Stats")
	int32 MediumCount;

	UPROPERTY(VisibleAnywhere, Category = "Grass|Stats")
	int32 FarCount;

	UPROPERTY(VisibleAnywhere, Category = "Grass|Stats")
	int32 CulledCount;

	UPROPERTY(VisibleAnywhere, Category = "Grass|Stats")
	int32 ImpostorCount;

	UPROPERTY(VisibleAnywhere, Category = "Grass|Stats")
	int32 FrustumCulledCount;

	UPROPERTY(VisibleAnywhere, Category = "Grass|Stats")
	int32 OcclusionCulledCount;

	UPROPERTY(VisibleAnywhere, Category = "Grass|Stats")
	float CullingEfficiency;

	UPROPERTY(EditAnywhere, Category = "Grass|Wind")
	float WindSpeed;

	UPROPERTY(EditAnywhere, Category = "Grass|Wind")
	FVector GlobalWindDirection;

	UPROPERTY(EditAnywhere, Category = "Grass|Wind")
	float GlobalWindStrength;

	UFUNCTION(BlueprintCallable, Category = "Grass")
	void InitializeGrass();

	UFUNCTION(BlueprintCallable, Category = "Grass")
	void RegenerateGrass();

	UFUNCTION(BlueprintCallable, Category = "Grass")
	void UpdateWindParameters(const FVector& WindDir, float Strength, float Speed);

	UFUNCTION(BlueprintCallable, Category = "Grass|Stats")
	float GetCullingEfficiency() const { return CullingEfficiency; }

	UFUNCTION(BlueprintCallable, Category = "Grass|Stats")
	int32 GetRenderedCount() const { return CloseCount + MediumCount + FarCount + ImpostorCount; }

	UFUNCTION(BlueprintCallable, Category = "Grass|Stats")
	int32 GetTotalCount() const { return TotalGrassCount; }

	UFUNCTION(BlueprintCallable, Category = "Grass|Stats")
	FString GetStatsString() const;

	UFUNCTION(BlueprintCallable, Category = "Grass|LOD")
	void ForceLODUpdate();

	UFUNCTION(BlueprintCallable, Category = "Grass|LOD")
	float GetLODHysteresis() const;

	UFUNCTION(BlueprintCallable, Category = "Grass|Prediction")
	void SetCameraVelocity(const FVector& Velocity);

	UFUNCTION(BlueprintCallable, Category = "Grass|Culling")
	void ForceOcclusionTest();

	UFUNCTION(BlueprintCallable, Category = "Grass|Culling")
	void SetFrustumCullingEnabled(bool bEnabled);

	UFUNCTION(BlueprintCallable, Category = "Grass|Culling")
	void SetOcclusionCullingEnabled(bool bEnabled);

protected:
	UPROPERTY(Transient)
	TArray<FGrassChunkData> GrassChunks;

	UPROPERTY(Transient)
	TArray<FGrassInstance> AllInstances;

	UPROPERTY(Transient)
	TArray<int32> FreeCloseIndices;

	UPROPERTY(Transient)
	TArray<int32> FreeMediumIndices;

	UPROPERTY(Transient)
	TArray<int32> FreeFarIndices;

	UPROPERTY(Transient)
	TArray<int32> FreeImpostorIndices;

	UPROPERTY(Transient)
	TArray<int32> HiddenCloseIndices;

	UPROPERTY(Transient)
	TArray<int32> HiddenMediumIndices;

	UPROPERTY(Transient)
	TArray<int32> HiddenFarIndices;

	UPROPERTY(Transient)
	TArray<int32> HiddenImpostorIndices;

	UPROPERTY(Transient)
	FTimerHandle LODUpdateTimerHandle;

	float TimeSinceLastLODUpdate;

	FVector LastCameraPosition;

	FVector CameraVelocity;

	int32 CurrentUpdateBatchStart;

	FVector PredictedCameraPosition;

	FFrustumPlanes CurrentFrustumPlanes;

	float TimeSinceLastOcclusionTest;

	int32 CurrentOcclusionTestChunk;

	UPROPERTY(Transient)
	TArray<FOcclusionQueryResult> PendingOcclusionResults;

	void UpdateLODStates();

	void UpdateChunkVisibility();

	void UpdateGrassTransforms();

	void UpdateWind(float DeltaTime);

	void InitializeISMComponents();

	void GenerateGrassInstances();

	int32 GetChunkIndex(const FVector& Position) const;

	FVector GetChunkPosition(int32 ChunkIndex) const;

	EGrassLOD CalculateLOD(const FVector& Position, const FVector& CameraPosition, EGrassLOD CurrentLOD) const;

	void AssignInstanceToISM(FGrassInstance& Instance, EGrassLOD NewLOD);

	void RemoveInstanceFromISM(FGrassInstance& Instance);

	void HideInstanceInISM(FGrassInstance& Instance);

	void ShowInstanceInISM(FGrassInstance& Instance);

	void UpdateMaterialParameters();

	float CalculateTransitionAlpha(const FVector& Position, const FVector& CameraPosition) const;

	void UpdateCameraPrediction(float DeltaTime);

	EGrassLOD GetLODFromDistance(float Distance, EGrassLOD CurrentLOD) const;

	float GetHysteresisDistance(float BaseDistance) const;

	void ProcessLODTransition(FGrassInstance& Instance, EGrassLOD NewTargetLOD, float DeltaTime);

	void UpdateTransitionAlphas(float DeltaTime);

	void UpdateHiddenInstances();

	void UpdateFrustumPlanes();

	FVector NearBottomRight() const;

	bool IsBoxInFrustum(const FBox& Bounds, const FFrustumPlanes& Frustum, float Padding = 0.0f) const;

	void PerformFrustumCulling();

	void PerformOcclusionCulling();

	void TestChunkOcclusion(FGrassChunkData& Chunk);

	void UpdateChunkOcclusionStates();

	void ApplyCullingResults();

	float GetHZBDepth(const FVector& WorldPosition) const;

	void InitializeHZBResources();

	void UpdateHZBTexture();

	FVector2D ProjectWorldToScreen(const FVector& WorldPos) const;

	UPROPERTY()
	UTextureRenderTarget2D* HZBDepthTexture;

	UPROPERTY()
	USceneCaptureComponent2D* DepthCaptureComponent;

	FMatrix ViewProjectionMatrix;

	FVector2D ScreenSize;
};
