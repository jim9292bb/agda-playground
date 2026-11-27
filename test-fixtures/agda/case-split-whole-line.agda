module source where

data N : Set where
  z : N
  s : N -> N

data P (A B : Set) : Set where
  _,_ : A -> B -> P A B

f : N -> N -> P N N
f x y = ? , ?
