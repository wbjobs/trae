package tree

import (
	"k8s-topology/pkg/k8s"
)

type NodeState int

const (
	Collapsed NodeState = iota
	Expanded
)

type ChangeType int

const (
	ChangeNone ChangeType = iota
	ChangeAdded
	ChangeModified
	ChangeDeleted
)

type TreeNode struct {
	Data       *k8s.ResourceNode
	State      NodeState
	Change     ChangeType
	Children   []*TreeNode
	Parent     *TreeNode
}

func BuildTree(nodes []*k8s.ResourceNode) []*TreeNode {
	result := make([]*TreeNode, 0, len(nodes))
	for _, n := range nodes {
		result = append(result, buildTreeRecursive(n, nil))
	}
	return result
}

func buildTreeRecursive(data *k8s.ResourceNode, parent *TreeNode) *TreeNode {
	tn := &TreeNode{
		Data:   data,
		State:  Collapsed,
		Parent: parent,
	}
	if len(data.Children) > 0 {
		tn.Children = make([]*TreeNode, 0, len(data.Children))
		for _, child := range data.Children {
			tn.Children = append(tn.Children, buildTreeRecursive(child, tn))
		}
	}
	return tn
}

func (t *TreeNode) Toggle() {
	if len(t.Children) == 0 {
		return
	}
	if t.State == Expanded {
		t.State = Collapsed
	} else {
		t.State = Expanded
	}
}

func (t *TreeNode) ExpandAll() {
	if len(t.Children) > 0 {
		t.State = Expanded
		for _, c := range t.Children {
			c.ExpandAll()
		}
	}
}

func (t *TreeNode) CollapseAll() {
	t.State = Collapsed
	for _, c := range t.Children {
		c.CollapseAll()
	}
}

type FlattenItem struct {
	Node  *TreeNode
	Depth int
	Index int
}

func Flatten(roots []*TreeNode) []*FlattenItem {
	estimated := countExpanded(roots)
	items := make([]*FlattenItem, 0, estimated)
	for _, r := range roots {
		flattenIterative(r, &items)
	}
	for i, item := range items {
		item.Index = i
	}
	return items
}

func countExpanded(roots []*TreeNode) int {
	count := 0
	for _, r := range roots {
		count += countNode(r)
	}
	return count
}

func countNode(node *TreeNode) int {
	c := 1
	if node.State == Expanded {
		for _, child := range node.Children {
			c += countNode(child)
		}
	}
	return c
}

func flattenIterative(root *TreeNode, items *[]*FlattenItem) {
	type frame struct {
		node  *TreeNode
		depth int
	}
	stack := []frame{{node: root, depth: 0}}

	for len(stack) > 0 {
		f := stack[len(stack)-1]
		stack = stack[:len(stack)-1]

		*items = append(*items, &FlattenItem{Node: f.node, Depth: f.depth})

		if f.node.State == Expanded && len(f.node.Children) > 0 {
			for i := len(f.node.Children) - 1; i >= 0; i-- {
				stack = append(stack, frame{node: f.node.Children[i], depth: f.depth + 1})
			}
		}
	}
}

func ExpandByKind(roots []*TreeNode, kind string) {
	for _, r := range roots {
		expandByKindIterative(r, kind)
	}
}

func expandByKindIterative(node *TreeNode, kind string) {
	stack := []*TreeNode{node}
	for len(stack) > 0 {
		n := stack[len(stack)-1]
		stack = stack[:len(stack)-1]

		if n.Data.Kind == kind && len(n.Children) > 0 {
			n.State = Expanded
		}
		for i := len(n.Children) - 1; i >= 0; i-- {
			stack = append(stack, n.Children[i])
		}
	}
}

func CollapseByKind(roots []*TreeNode, kind string) {
	for _, r := range roots {
		collapseByKindIterative(r, kind)
	}
}

func collapseByKindIterative(node *TreeNode, kind string) {
	stack := []*TreeNode{node}
	for len(stack) > 0 {
		n := stack[len(stack)-1]
		stack = stack[:len(stack)-1]

		if n.Data.Kind == kind {
			n.State = Collapsed
		}
		for i := len(n.Children) - 1; i >= 0; i-- {
			stack = append(stack, n.Children[i])
		}
	}
}

func ApplyChanges(roots []*TreeNode, changes map[string]ChangeType) {
	for _, r := range roots {
		applyChangesIterative(r, changes)
	}
}

func applyChangesIterative(root *TreeNode, changes map[string]ChangeType) {
	stack := []*TreeNode{root}
	for len(stack) > 0 {
		n := stack[len(stack)-1]
		stack = stack[:len(stack)-1]

		if ct, ok := changes[n.Data.ID()]; ok {
			n.Change = ct
		} else {
			n.Change = ChangeNone
		}
		for i := len(n.Children) - 1; i >= 0; i-- {
			stack = append(stack, n.Children[i])
		}
	}
}
