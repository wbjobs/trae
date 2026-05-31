// Copyright Epic Games, Inc. All Rights Reserved.

using UnrealBuildTool;

public class GrassCulling : ModuleRules
{
	public GrassCulling(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;
		
		PublicIncludePaths.AddRange(new string[]
		{
			"GrassCulling/Public",
		});
		
		PrivateIncludePaths.AddRange(new string[]
		{
			"GrassCulling/Private",
		});
		
		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"Landscape",
			"Foliage",
			"RenderCore",
			"RHI",
		});
		
		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"Slate",
			"SlateCore",
			"UMG",
		});
	}
}
