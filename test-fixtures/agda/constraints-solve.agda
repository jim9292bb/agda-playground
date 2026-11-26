data N : Set where
  z : N
  s : N -> N

data _==_ {A : Set} (x : A) : A -> Set where
  refl : x == x

-- Load solves this goal's meta by unification: Solve fills in z.
p : z == z
p = refl {x = ?}

g : N -> N
g z = z
g (s n) = z

-- g _ never reduces, so Load leaves the constraint g _ = z unsolved.
r : g _ == z
r = refl
