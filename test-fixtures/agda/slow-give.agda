module source where

data N : Set where
  z : N
  s : N -> N

_+_ : N -> N -> N
z + b = b
s a + b = s (a + b)

_*_ : N -> N -> N
z * b = z
s a * b = b + (a * b)

ten : N
ten = s (s (s (s (s (s (s (s (s (s z)))))))))

data _==_ {A : Set} (x : A) : A -> Set where
  refl : x == x

p : (ten * (ten * ten)) == ((ten * ten) * ten)
p = {! refl !}

q : N
q = {!   !}
