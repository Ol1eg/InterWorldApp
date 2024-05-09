import * as z from 'zod';

export const PostValidation = z.object({
    post: z.string().nonempty().min(4, {message:'Minimum 4 characters'}),
    accountId: z.string(),
})

export const CommentValidation = z.object({
    post: z.string().nonempty().min(4, {message:'Minimum 4 characters'}),
    
})